'use strict'

class CircuitOpenException extends Error {
  constructor (commandKey, message) {
    super(message)
    Error.captureStackTrace(this, CircuitOpenException)

    this.commandKey = commandKey
  }
}

module.exports.CircuitOpenException = CircuitOpenException
