'use strict'

const Command = require('./command')

/**
 * Circuit Breaker Command
 * @type {Command}
 */
module.exports.Command = Command

/**
 * Command factory function
 * Makes command creation easier
 * @param {string} key
 * @return {Command}
 */
module.exports.Factory = (key) => new Command(key)
