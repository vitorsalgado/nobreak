/* eslint-disable func-style */

'use strict'

const CircuitStates = require('./states')
const IndividualConfig = require('./config')

const CircuitDataDictionary = new Map()
const CircuitInstancesDictionary = new Map()

/**
 * Circuit
 * @constructor
 */
function Circuit (commandKey, requestVolumeThreshold, errorPercentageThreshold, sleepWindowInMilliseconds) {
  this.commandkey = commandKey
  this.state = CircuitStates.CLOSED
  this.totalCalls = 0
  this.errorCalls = 0
  this.requestVolumeThreshold = IndividualConfig.requestVolumeThreshold(commandKey) || requestVolumeThreshold
  this.errorThreshold = IndividualConfig.errorPercentageThreshold(commandKey) || errorPercentageThreshold
  this.sleepWindowInMilliseconds = IndividualConfig.sleepWindowInMilliseconds(commandKey) || sleepWindowInMilliseconds
  this.ongoingSleepWindow = undefined
  this.forceOpen = IndividualConfig.forceOpen(commandKey) || false
}

/**
 * Get a new Circuit instance. If no one is found in instances dictionary, a new one will be created and add to it,
 * avoiding unnecessary initializations
 * @param {string} commandKey
 * @param {number} requestVolumeThreshold
 * @param {number} errorPercentageThreshold
 * @param {number} sleepWindowInMilliseconds
 * @return {Circuit}
 */
module.exports.getInstance = (commandKey, requestVolumeThreshold, errorPercentageThreshold, sleepWindowInMilliseconds) => {
  const instance = CircuitInstancesDictionary.get(commandKey)

  if (instance) {
    instance.reloadStats()
    return instance
  }

  const circuit =
    new Circuit(commandKey, requestVolumeThreshold, errorPercentageThreshold, sleepWindowInMilliseconds)

  CircuitInstancesDictionary.set(commandKey, circuit)

  return circuit
}

/**
 * Sets circuit instance current stats
 */
Circuit.prototype.reloadStats = function () {
  const stats = CircuitDataDictionary.get(this.commandkey)

  if (!stats) {
    return
  }

  this.totalCalls = stats.totalCalls
  this.errorCalls = stats.errorCalls

  if (isSleepWindowOver(this)) {
    this.ongoingSleepWindow = undefined
    this.state = CircuitStates.HALF_OPEN
    return
  }

  this.state = stats.state
  this.ongoingSleepWindow = stats.ongoingSleepWindow
}

/**
 * Checks if command is allowed to be executed, giving his current state and health
 * @return {boolean}
 */
Circuit.prototype.allowExecution = function () {
  return !this.forceOpen && (this.state === CircuitStates.CLOSED || this.state === CircuitStates.HALF_OPEN)
}

Circuit.prototype.isHalfOpen = function () {
  return this.state === CircuitStates.HALF_OPEN
}

/**
 * Register a circuit execution for further health metrics calculation.
 * finishWorkflow must be called to proper persistent circuit stats
 */
Circuit.prototype.registerCall = function () {
  this.totalCalls++
}

/**
 * Registers a new error response from command and recalculate circuit health.
 * Depending of the checkup result, the circuit state will be changed to OPEN
 */
Circuit.prototype.registerErrorAndCalculateMetrics = function () {
  this.errorCalls++

  const shouldCheckHealth = this.totalCalls >= this.requestVolumeThreshold
  const errorPercentage = this.errorCalls / this.totalCalls * 100

  if (shouldCheckHealth && errorPercentage >= this.errorThreshold) {
    this.state = CircuitStates.OPEN
    this.ongoingSleepWindow = Date.now() + this.sleepWindowInMilliseconds
  }

  this.finishWorkflow()
}

/**
 * After a sliding window expires and the circuit is retested,
 * this must be called to change circuit state to CLOSED and reset stats
 */
Circuit.prototype.markSuccess = function () {
  this.state = CircuitStates.CLOSED
  this.totalCalls = 0
  this.errorCalls = 0
}

/**
 * Commits circuit changes.
 * This ensures that only one data dictionary write will be made.
 */
Circuit.prototype.finishWorkflow = function () {
  const opts = {
    totalCalls: this.totalCalls,
    errorCalls: this.errorCalls,
    ongoingSleepWindow: this.ongoingSleepWindow,
    state: this.state
  }

  CircuitDataDictionary.set(this.commandkey, opts)
}

function isSleepWindowOver (circuit) {
  const val = circuit.ongoingSleepWindow
  return !!(val && new Date(val) < new Date())
}
