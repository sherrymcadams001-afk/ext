// Timing utilities for human-like behavior
class HumanTiming {
  
  // Generate human-like delay between 800ms-2200ms
  static getRandomActionDelay() {
    return 800 + Math.random() * 1400;
  }
  
  // Generate typing delay between characters (30-120ms)
  static getTypingDelay() {
    return 30 + Math.random() * 90;
  }
  
  // Generate mouse movement delay (50-150ms)
  static getMouseDelay() {
    return 50 + Math.random() * 100;
  }
  
  // Generate scroll delay (200-800ms)
  static getScrollDelay() {
    return 200 + Math.random() * 600;
  }
  
  // Generate page load wait time (1-3 seconds)
  static getPageLoadDelay() {
    return 1000 + Math.random() * 2000;
  }
  
  // Simulate human reading time based on content length
  static getReadingDelay(contentLength) {
    // Average reading speed: 200-300 words per minute
    const wordsPerMinute = 200 + Math.random() * 100;
    const words = contentLength / 5; // Rough estimate: 5 chars per word
    const readingTimeMs = (words / wordsPerMinute) * 60 * 1000;
    
    // Add some randomness and ensure minimum delay
    return Math.max(500, readingTimeMs * (0.8 + Math.random() * 0.4));
  }
  
  // Random pause to simulate human thinking
  static getThinkingDelay() {
    return 500 + Math.random() * 2000;
  }
}

module.exports = HumanTiming;