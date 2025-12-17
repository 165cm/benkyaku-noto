
export interface GoogleBookInfo {
  title: string
  subtitle?: string
  authors: string[]
  description: string
  publishedDate: string
  publisher: string
  isbn: string
  coverUrl: string | null
  categories: string[]
  pageCount?: number
  previewLink?: string
}

export async function fetchBookByISBN(isbn: string): Promise<GoogleBookInfo | null> {
  const cleanIsbn = isbn.replace(/-/g, '')
  if (!cleanIsbn) return null

  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`)

    if (!response.ok) {
      throw new Error('Google Books API request failed')
    }

    const data = await response.json()

    if (!data.items || data.items.length === 0) {
      return null
    }

    const volumeInfo = data.items[0].volumeInfo

    // Get high quality image if possible
    let coverUrl = null
    if (volumeInfo.imageLinks) {
      coverUrl = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail
      // Replace http with https
      if (coverUrl && coverUrl.startsWith('http://')) {
        coverUrl = coverUrl.replace('http://', 'https://')
      }
    }

    // ISBN取得（ISBN-10を優先、なければISBN-13、それもなければ検索クエリ）
    let isbn = cleanIsbn
    if (volumeInfo.industryIdentifiers) {
      const isbn10 = volumeInfo.industryIdentifiers.find((id: any) => id.type === 'ISBN_10')
      const isbn13 = volumeInfo.industryIdentifiers.find((id: any) => id.type === 'ISBN_13')
      if (isbn10) {
        isbn = isbn10.identifier
      } else if (isbn13) {
        isbn = isbn13.identifier
      }
    }

    return {
      title: volumeInfo.title || '',
      subtitle: volumeInfo.subtitle,
      authors: volumeInfo.authors || [],
      description: volumeInfo.description || '',
      publishedDate: volumeInfo.publishedDate || '',
      publisher: volumeInfo.publisher || '',
      isbn: isbn,
      coverUrl,
      categories: volumeInfo.categories || [],
      pageCount: volumeInfo.pageCount,
      previewLink: volumeInfo.previewLink
    }
  } catch (error) {
    console.error('Error fetching book info:', error)
    return null
  }
}
