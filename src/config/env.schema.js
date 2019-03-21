'use strict'

/**
 * Environment variables schema and data transformation.
 * This should be used instead of direct calling process.env.
 * @module EnvVars
 */

const Joi = require('joi')

/**
 * Environment variables schema
 * @enum
 * @readonly
 */
module.exports = Joi.object(
  {
    /**
     * Application runtime environment
     * @const NODE_ENV
     * @type {string}
     * @default development
     * */
    NODE_ENV: Joi.string().allow('development', 'test', 'production').default('production')
  })
  .unknown(true)
  .options({ abortEarly: false })
  .label('Env Vars')
