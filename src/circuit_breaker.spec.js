/* eslint-disable hapi/hapi-for-you,no-confusing-arrow */

'use strict'

const UUID = require('uuid')
const Promise = require('bluebird')

const Logger = require('../logger')
const Command = require('./').Command
const Factory = require('./').Factory
const Configurer = require('./config')

const { CircuitOpenException } = require('./exceptions')

const LONG_SLEEP_WINDOW = 24 * 60 * 60 * 1000

describe('Circuit Breaker', () => {
  beforeAll(() => jest.setTimeout(20000))

  it('should throw exception when an invalid key is provided', () => {
    expect(() => new Command()).toThrowError()
  })

  it('should return fallback data when action fails', async () => {
    const fallbackData = 'FALLBACK'

    const result = await new Command('test_1')
      .fallbackTo(() => Promise.resolve(fallbackData))
      .action((value) => Promise.reject(new Error(value)))
      .execute('TESTE')

    expect(result).toEqual(fallbackData)
  })

  it('should wait request threshold to check circuit overall health', async () => {
    const action = jest.fn(() => Promise.reject(new Error('FAIL')))
    const fallback = jest.fn()

    const cmd = await Factory('test_2')
      .requestVolumeThreshold(80)
      .errorThresholdPercentage(50)
      .sleepWindowInMilliseconds(LONG_SLEEP_WINDOW)
      .fallbackTo(fallback)
      .action(action)

    for (let i = 0; i < 100; i++) {
      await cmd.execute()
    }

    expect(fallback).toHaveBeenCalledTimes(100)
    expect(action).toHaveBeenCalledTimes(80)
  })

  it('should resume with fallback when circuit is open', async () => {
    let val = 0
    const action = jest.fn(() => val >= 90 ? Promise.reject(new Error('FAIL')) : Promise.resolve())
    const fallback = jest.fn()

    const cmd = await new Command('test_3')
      .requestVolumeThreshold(0)
      .errorThresholdPercentage(10)
      .fallbackTo(fallback)
      .action(action)

    for (let i = 0; i < 110; i++) {
      await cmd.execute()
      val++
    }

    expect(fallback).toHaveBeenCalledTimes(20)
    expect(action).toHaveBeenCalledTimes(100)
  })

  it('should return error handled by command when one is provided', async () => {
    const fallbackData = 'FALLBACK'
    const errorHandler = jest.fn(() => new Error('New Error'))

    const result = await new Command('test_4')
      .errorHandler(errorHandler)
      .fallbackTo(() => Promise.resolve(fallbackData))
      .action((value) => Promise.reject(new Error(value)))
      .execute('TESTE')

    expect(result).toEqual(fallbackData)
    expect(errorHandler).toHaveBeenCalledTimes(1)
  })

  it('should return original exception when error filter returns true', () => {
    const fallbackData = 'FALLBACK'

    const error = new Error('ERROR FATAL')
    error.isTestError = true

    const filter = jest.fn((err) => err.isTestError)

    return new Command('test_5')
      .filterWhen(filter)
      .fallbackTo(() => Promise.resolve(fallbackData))
      .action(() => Promise.reject(error))
      .execute('TESTE')
      .catch((err) => {
        expect(err).toEqual(error)
        expect(filter).toHaveBeenCalledTimes(1)
      })
  })

  it('should log errors when "enableLog" is set', async () => {
    const fallbackData = 'FALLBACK'
    const traceId = UUID.v4()
    const error = new Error('SUPER ERROR')
    const key = 'test_5'

    Logger.warn = jest.fn()

    await new Command(key)
      .withTraceId(traceId)
      .enableLog()
      .fallbackTo(() => Promise.resolve(fallbackData))
      .action(() => Promise.reject(error))
      .execute('TESTE')

    expect(Logger.warn).toHaveBeenCalledTimes(1)
    expect(Logger.warn).toHaveBeenCalledWith(error, ['circuit-breaker', key], traceId)
  })

  it('should return the provided fallback when a timeout occurs', async () => {
    const fallbackData = 'FALLBACK'
    const longRunningAction = jest.fn(() =>
      new Promise((resolve) =>
        setTimeout(resolve, 2000)))

    Logger.warn = jest.fn()

    const result = await new Command('test_6')
      .timeout(500)
      .fallbackTo(() => Promise.resolve(fallbackData))
      .action(longRunningAction)
      .execute()

    expect(longRunningAction).toBeCalled()
    expect(result).toEqual(fallbackData)
  })

  it('should set circuit from open to half open state when sliding window expires', async (done) => {
    let val = 0
    const success = 'test-success'
    const spy = jest.fn(() => Promise.resolve(success))

    const action = jest.fn(() => {
      if (val <= 9) {
        return Promise.resolve()
      }

      if (val > 9 && val < 20) {
        return Promise.reject(new Error('FAIL'))
      }

      return spy()
    })

    const fallback = jest.fn()

    const cmd = await Factory('test_7')
      .requestVolumeThreshold(20)
      .errorThresholdPercentage(50)
      .sleepWindowInMilliseconds(500)
      .fallbackTo(fallback)
      .action(action)

    for (let i = 0; i < 20; i++) {
      await cmd.execute()
      val++
    }

    setTimeout(async () => {
      const res = await cmd.execute()

      expect(fallback).toHaveBeenCalledTimes(10)
      expect(action).toHaveBeenCalledTimes(21)
      expect(res).toEqual(success)
      expect(spy).toBeCalled()

      done()
    }, 1000)
  })

  it('should return original error when no fallback is provided', () => {
    const ex = new Error('ERROR WITHOUT FALLBACK')

    return new Command('test_8')
      .action(() => Promise.reject(ex))
      .execute()
      .catch((err) => expect(err).toEqual(ex))
  })

  it('should return fallback direct when circuit is opened by force ( via env var )', () => {
    Configurer.forceOpen = jest.fn(() => true)

    const action = jest.fn(() => Promise.resolve())

    return new Command('test_9')
      .action(action)
      .execute()
      .catch((err) => {
        expect(err).toBeInstanceOf(CircuitOpenException)
        expect(action).not.toHaveBeenCalled()
      })
  })
})
