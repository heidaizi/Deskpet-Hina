import { describe, expect, it } from 'vitest'
import { shouldChunkSpeech, splitSpeechText } from '../../src/shared/speech-chunks'

describe('speech chunking', () => {
  it('keeps short replies as one synthesis request', () => {
    const text = 'まず権限を確認して。'
    expect(shouldChunkSpeech(text)).toBe(false)
    expect(splitSpeechText(text)).toEqual([text])
  })

  it('keeps the first Japanese phrase short enough for early playback', () => {
    const text = '先生、もう夜の七時を過ぎたよ。週末くらい、少し休んで。ずっと画面の前にいないで。'
    const chunks = splitSpeechText(text)

    expect(chunks).toEqual([
      '先生、もう夜の七時を過ぎたよ。',
      '週末くらい、少し休んで。',
      'ずっと画面の前にいないで。',
    ])
    expect(chunks.map((chunk) => Array.from(chunk).length).every((length) => length <= 22)).toBe(
      true,
    )
    expect(chunks.join('')).toBe(text)
  })

  it('hard-splits a long clause without punctuation', () => {
    const text = 'あ'.repeat(75)
    const chunks = splitSpeechText(text, { firstChunkChars: 18, maxChunkChars: 24 })

    expect(chunks).toHaveLength(4)
    expect(chunks.every((chunk) => Array.from(chunk).length <= 24)).toBe(true)
    expect(chunks.join('')).toBe(text)
  })

  it('does not split non-Japanese dynamic text', () => {
    expect(splitSpeechText('这是一条比较长的中文动态回复，但仍应作为一个整体处理。')).toEqual([
      '这是一条比较长的中文动态回复，但仍应作为一个整体处理。',
    ])
  })
})
