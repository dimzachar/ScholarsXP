import { NextRequest, NextResponse } from 'next/server'
import { gzip } from 'zlib'
import { promisify } from 'util'

const gzipAsync = promisify(gzip)

/**
 * Response compression middleware for API routes
 * Provides 60-70% size reduction for JSON responses
 */
export function withCompression<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const response = await handler(...args)
    
    // Only compress JSON responses
    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('application/json')) {
      return response
    }

    // Check if client accepts gzip encoding
    const request = args[0] as NextRequest
    const acceptEncoding = request.headers.get('accept-encoding') || ''
    
    if (!acceptEncoding.includes('gzip')) {
      return response
    }

    // Get response body
    const body = await response.text()
    
    // Skip compression for small responses (< 1KB)
    if (body.length < 1024) {
      return new NextResponse(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    }

    try {
      // Compress the response
      const compressed = await gzipAsync(body)
      
      // Calculate compression ratio for monitoring
      const originalSize = Buffer.byteLength(body, 'utf8')
      const compressedSize = compressed.length
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1)
      
      // Create compressed response with appropriate headers
      const compressedResponse = new NextResponse(compressed, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'Content-Encoding': 'gzip',
          'Content-Length': compressed.length.toString(),
          'X-Original-Size': originalSize.toString(),
          'X-Compressed-Size': compressedSize.toString(),
          'X-Compression-Ratio': `${compressionRatio}%`,
          'Vary': 'Accept-Encoding'
        }
      })

      // Log compression stats for monitoring
      console.log(`🗜️  Compressed response: ${originalSize}B → ${compressedSize}B (${compressionRatio}% reduction)`)
      
      return compressedResponse
    } catch (error) {
      console.error('Compression failed:', error)
      // Return original response if compression fails
      return new NextResponse(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    }
  }
}

/**
 * Simple compression utility for direct use
 */
export async function compressResponse(data: unknown): Promise<{
  compressed: Buffer
  originalSize: number
  compressedSize: number
  compressionRatio: number
}> {
  const jsonString = JSON.stringify(data)
  const originalSize = Buffer.byteLength(jsonString, 'utf8')
  
  const compressed = await gzipAsync(jsonString)
  const compressedSize = compressed.length
  const compressionRatio = ((originalSize - compressedSize) / originalSize * 100)
  
  return {
    compressed,
    originalSize,
    compressedSize,
    compressionRatio
  }
}

/**
 * Middleware for Next.js API routes that automatically compresses responses
 * Usage: export const GET = withCompression(async (request) => { ... })
 */
export function withAutoCompression(handler: (request: NextRequest) => Promise<NextResponse>) {
  return withCompression(handler)
}

/**
 * Check if request supports compression
 */
export function supportsCompression(request: NextRequest): boolean {
  const acceptEncoding = request.headers.get('accept-encoding') || ''
  return acceptEncoding.includes('gzip') || acceptEncoding.includes('deflate')
}

/**
 * Get optimal compression settings based on response size
 */
export function getCompressionSettings(responseSize: number): {
  shouldCompress: boolean
  level: number
} {
  // Don't compress very small responses
  if (responseSize < 1024) {
    return { shouldCompress: false, level: 0 }
  }
  
  // Use different compression levels based on size
  if (responseSize < 10 * 1024) { // < 10KB
    return { shouldCompress: true, level: 1 } // Fast compression
  } else if (responseSize < 100 * 1024) { // < 100KB
    return { shouldCompress: true, level: 6 } // Balanced
  } else {
    return { shouldCompress: true, level: 9 } // Maximum compression for large responses
  }
}

/**
 * Performance monitoring for compression
 */
export class CompressionMonitor {
  private static stats = {
    totalRequests: 0,
    compressedRequests: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    averageCompressionRatio: 0
  }

  static recordCompression(originalSize: number, compressedSize: number) {
    this.stats.totalRequests++
    this.stats.compressedRequests++
    this.stats.totalOriginalSize += originalSize
    this.stats.totalCompressedSize += compressedSize
    
    const totalSavings = this.stats.totalOriginalSize - this.stats.totalCompressedSize
    this.stats.averageCompressionRatio = (totalSavings / this.stats.totalOriginalSize) * 100
  }

  static recordSkipped() {
    this.stats.totalRequests++
  }

  static getStats() {
    return {
      ...this.stats,
      compressionRate: (this.stats.compressedRequests / this.stats.totalRequests) * 100,
      totalBytesSaved: this.stats.totalOriginalSize - this.stats.totalCompressedSize
    }
  }

  static reset() {
    this.stats = {
      totalRequests: 0,
      compressedRequests: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      averageCompressionRatio: 0
    }
  }
}
