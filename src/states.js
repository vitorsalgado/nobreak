'use strict'

/**
 * Circuit state enums
 * @enum
 * @type {{OPEN: string, HALF_OPEN: string, CLOSED: string}}
 */
module.exports = {
  /**
   * OPEN state is when the circuit will skip calling the remote service
   * and return the fallback direct, if any is configured.
   */
  OPEN: 'open',

  /**
   * HALF OPEN state is when a single test call can be performed to check circuit health.
   * If this call succeeds, the circuit will be closed, otherwise, the circuit will be kept open.
   */
  HALF_OPEN: 'half_open',

  /**
   * CLOSED state, the circuit will allow the command action to be called normally.
   * It will only collect metrics for further health check.
   */
  CLOSED: 'closed'
}
