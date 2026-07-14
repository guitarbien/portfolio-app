import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('顯示應用程式標題', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '投資組合' })).toBeInTheDocument()
  })
})
