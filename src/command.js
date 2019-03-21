/* eslint-disable func-style */

'use strict'

const Promise = require('bluebird')
const Boom = require('boom')

const Circuit = require('./circuit')
const Logger = require('../logger')
const Config = require('./config')
const CommandConfig = require('./config')

const { CircuitOpenException } = require('./exceptions')

const TAG = 'circuit-breaker'

/**
 * Circuit Breaker Command
 * The command is responsible for wrap potentially risky functionality, like a remote service call,
 * with fault and latency tolerance using a circuit breaker
 * @param {string} key - Command unique key
 * @constructor
 */
function Command (key) {
  if (!key) {
    throw new Error('command key is required!')
  }

  const opts = {}

  opts.key = key
  opts.traceId = undefined
  opts.timeout = undefined
  opts.timeout = CommandConfig.timeout(key) || Config.circuitBreaker.timeout
  opts.requestVolumeThreshold = Config.circuitBreaker.requestVolumeThreshold
  opts.errorThreshold = Config.circuitBreaker.errorThresholdPercentage
  opts.sleepWindowInMillis = Config.circuitBreaker.sleepWindowInMilliseconds
  opts.fallback = undefined
  opts.errorFilter = undefined
  opts.errorHandler = undefined
  opts.action = undefined
  opts.isLogEnable = false
  opts.circuit = undefined

  this.opts = opts
}

/**
 * Sets the trace id related to this command, which will be logged along with the error if log is enabled.
 * @param {string} traceId - is preferred to be same trace id generated in http request arrival.
 * @return {Command}
 */
Command.prototype.withTraceId = function (traceId) {
  this.opts.traceId = traceId
  return this
}

/**
 * Set command timeout.
 * If command execution time exceed, an TimeoutException will be throw.
 * @param timeout
 * @return {Command}
 */
Command.prototype.timeout = function (timeout) {
  this.opts.timeout = CommandConfig.timeout(this.opts.key) || timeout
  return this
}

/**
 * Sets the amount percentage which the circuit should be opened and the fallback returned without even calling
 * the actual service.
 * @param {number} threshold
 * @return {Command}
 */
Command.prototype.errorThresholdPercentage = function (threshold) {
  this.opts.errorThreshold = threshold
  return this
}

/**
 * Set command sleep window, which is the value that the circuit should wait until a new test is performed against the
 * real service.
 * @param {number} sleepWindow
 * @return {Command}
 */
Command.prototype.sleepWindowInMilliseconds = function (sleepWindow) {
  this.opts.sleepWindowInMillis = sleepWindow
  return this
}

/**
 * Sets the minimum number of requests which the action will be called without a checkup of circuit overall health.
 * @param {number} requestVolume
 * @return {Command}
 */
Command.prototype.requestVolumeThreshold = function (requestVolume) {
  this.opts.requestVolumeThreshold = requestVolume
  return this
}

/**
 * Sets the command fallback
 * @param {function} fallback
 * @return {Command}
 */
Command.prototype.fallbackTo = function (fallback) {
  this.opts.fallback = fallback
  return this
}

/**
 * Sets the action to be executed
 * @param {function} action
 * @return {Command}
 */
Command.prototype.action = function (action) {
  this.opts.action = Promise.method(action)
  return this
}

/**
 * Sets a function to filter errors from circuit action.
 * @param {function} handler - Promise function expecting the first parameter to be an error followed by action params.
 * @return {Command}
 */
Command.prototype.filterWhen = function (handler) {
  this.opts.errorFilter = handler
  return this
}

/**
 * If this returns an error, this circuit will all behaviors for failures, such as the fallback. If none, the circuit
 * will finish execution normally as if it was a successful execution.
 * @param {function} handler
 * @return {Command}
 */
Command.prototype.errorHandler = function (handler) {
  this.opts.errorHandler = handler
  return this
}

/**
 * Enable log for command failures. The default is false.
 * @return {Command}
 */
Command.prototype.enableLog = function () {
  this.opts.isLogEnable = true
  return this
}

/**
 * Executes the command.
 * @param params - Pass here the same parameters in same order that the actual service call requires
 * @return {*}
 */
Command.prototype.execute = function (...params) {
  const commandKey = this.opts.key

  this.opts.circuit = Circuit.getInstance(
    this.opts.key, this.opts.requestVolumeThreshold, this.opts.errorThreshold, this.opts.sleepWindowInMillis)

  this.opts.circuit.registerCall()

  if (this.opts.circuit.allowExecution()) {
    return this.opts
      .action(...params)
      .timeout(this.opts.timeout)
      .then((result) => {
        if (this.opts.circuit.isHalfOpen()) {
          this.opts.circuit.markSuccess()
        }

        this.opts.circuit.finishWorkflow()

        return result
      })
      .catch((err) => {
        let exception = err

        if (exception instanceof Promise.TimeoutError) {
          exception = Boom.gatewayTimeout(null, exception)
        }

        if (this.opts.errorHandler) {
          exception = this.opts.errorHandler(err)
        }

        if (this.opts.errorFilter && this.opts.errorFilter(exception, ...params)) {
          this.opts.circuit.finishWorkflow()
          return Promise.reject(exception)
        }

        this.opts.circuit
          .registerErrorAndCalculateMetrics(commandKey, this.opts.errorThreshold, this.opts.sleepWindowInMillis)

        return resumeWithFallback(exception, this, ...params)
      })
  }

  this.opts.circuit.finishWorkflow()

  return resumeWithFallback(null, this, ...params)
}

function resumeWithFallback (err, command, ...params) {
  if (command.opts.isLogEnable && err) {
    Logger.warn(err, [TAG, command.opts.key], command.opts.traceId)
  }

  if (command.opts.fallback) {
    return command.opts.fallback(err, ...params)
  }

  return Promise.reject(err || new CircuitOpenException(command.opts.key))
}

module.exports = Command
