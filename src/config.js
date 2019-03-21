'use strict'

const Joi = require('joi')
const Boolean = Joi.boolean().truthy('true', 'TRUE', '1').falsy('false', 'FALSE', '0')
const Num = Joi.number()

module.exports.forceOpen = (commandKey) =>
  Joi.attempt(
    getEnv(`app_circuit_${commandKey}_force_open`), Boolean.default(false))

module.exports.errorPercentageThreshold = (commandKey) =>
  Joi.attempt(
    getEnv(`app_circuit_${commandKey}_error_percentage_threshold`), Num)

module.exports.requestVolumeThreshold = (commandKey) =>
  Joi.attempt(
    getEnv(`app_circuit_${commandKey}_request_volume_threshold`), Num)

module.exports.sleepWindowInMilliseconds = (commandKey) =>
  Joi.attempt(
    getEnv(`app_circuit_${commandKey}_sleep_window_milliseconds`), Num)

module.exports.timeout = (commandKey) =>
  Joi.attempt(
    getEnv(`app_circuit_${commandKey}_timeout`), Num)

const getEnv = (pattern) => process.env[pattern]
