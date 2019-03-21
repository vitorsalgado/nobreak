'use strict'

const Joi = require('joi')

const Package = require('../../package.json')
const EnvSchema = require('./env.schema')

const EnvVars = Joi.attempt(process.env, EnvSchema)

module.exports = {
  env: EnvVars.NODE_ENV,
  version: Package.version,

  isProduction: EnvVars.NODE_ENV === 'production',
  isTest: EnvVars.NODE_ENV === 'test'
}
