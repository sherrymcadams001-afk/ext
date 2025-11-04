// Human-like behavioral patterns
class BehaviorRandomizer {
  
  // Add random mouse movements before clicking
  static async addRandomMouseMovement(page, targetElement) {
    const box = await targetElement.boundingBox();
    if (!box) return;
    
    // Generate random points around the target
    const points = [];
    const numPoints = 2 + Math.floor(Math.random() * 3); // 2-4 points
    
    for (let i = 0; i < numPoints; i++) {
      points.push({
        x: box.x + (Math.random() * box.width),
        y: box.y + (Math.random() * box.height)
      });
    }
    
    // Move mouse through points with delays
    for (const point of points) {
      await page.mouse.move(point.x, point.y);
      await this.randomDelay(20, 80);
    }
  }
  
  // Add random scroll behavior
  static async addRandomScrolling(page) {
    const shouldScroll = Math.random() > 0.3; // 70% chance to scroll
    if (!shouldScroll) return;
    
    const scrollDistance = 100 + Math.random() * 300;
    const direction = Math.random() > 0.5 ? 1 : -1;
    
    await page.evaluate((distance, dir) => {
      window.scrollBy(0, distance * dir);
    }, scrollDistance, direction);
    
    await this.randomDelay(200, 800);
  }
  
  // Simulate human typing with realistic patterns
  static async humanType(page, selector, text) {
    await page.focus(selector);
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Occasionally make "typos" and correct them
      if (Math.random() < 0.02 && i > 0) { // 2% typo rate
        const wrongChar = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        await page.keyboard.type(wrongChar);
        await this.randomDelay(100, 300);
        await page.keyboard.press('Backspace');
        await this.randomDelay(50, 150);
      }
      
      await page.keyboard.type(char);
      
      // Variable typing speed
      let delay = 80 + Math.random() * 120; // Base delay
      
      // Slower after punctuation
      if ('.!?'.includes(char)) {
        delay += 200 + Math.random() * 300;
      }
      
      // Faster for common letter combinations
      if (i > 0 && this.isCommonBigram(text[i-1] + char)) {
        delay *= 0.7;
      }
      
      await this.randomDelay(delay, delay + 50);
    }
  }
  
  // Check if bigram is common (for realistic typing speed)
  static isCommonBigram(bigram) {
    const common = ['th', 'he', 'in', 'er', 'an', 're', 'ed', 'nd', 'on', 'en'];
    return common.includes(bigram.toLowerCase());
  }
  
  // Random delay between min and max milliseconds
  static async randomDelay(min, max) {
    const delay = min + Math.random() * (max - min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }
  
  // Simulate reading behavior
  static async simulateReading(page) {
    // Get page content length for reading time calculation
    const contentLength = await page.evaluate(() => {
      return document.body.innerText.length;
    });
    
    const readingTime = 1000 + (contentLength / 20) + Math.random() * 2000;
    await this.randomDelay(readingTime * 0.8, readingTime * 1.2);
  }
  
  // Add random interactions to look human
  static async addRandomInteractions(page) {
    const actions = [
      async () => await this.addRandomScrolling(page),
      async () => await page.mouse.move(Math.random() * 1000, Math.random() * 800),
      async () => await this.randomDelay(1000, 3000), // Just wait
    ];
    
    if (Math.random() > 0.5) {
      const action = actions[Math.floor(Math.random() * actions.length)];
      await action();
    }
  }
}

module.exports = BehaviorRandomizer;