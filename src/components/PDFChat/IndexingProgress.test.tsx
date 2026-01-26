import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IndexingProgress } from './IndexingProgress'

describe('IndexingProgress', () => {
  it('renders progress state and percentage', () => {
    render(
      <IndexingProgress
        documentId="doc-123"
        documentName="Manual.pdf"
        progress={50}
        isIndexing={true}
      />
    )

    expect(screen.getByText('Indexing Document')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })
})
