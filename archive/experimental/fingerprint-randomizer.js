// Browser fingerprint randomization utilities
class FingerprintRandomizer {
  
  static getRandomUserAgent() {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }
  
  static getRandomViewport() {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1536, height: 864 },
      { width: 1440, height: 900 },
      { width: 1280, height: 720 }
    ];
    return viewports[Math.floor(Math.random() * viewports.length)];
  }
  
  static getRandomLanguage() {
    const languages = ['en-US', 'en-GB', 'en-CA', 'en-AU'];
    return languages[Math.floor(Math.random() * languages.length)];
  }
  
  static getRandomTimezone() {
    const timezones = [
      'America/New_York',
      'America/Los_Angeles', 
      'America/Chicago',
      'America/Denver',
      'Europe/London',
      'Europe/Berlin'
    ];
    return timezones[Math.floor(Math.random() * timezones.length)];
  }
  
  // Generate realistic browser launch args
  static getBrowserArgs() {
    return [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions-file-access-check',
      '--disable-extensions-http-throttling',
      '--disable-extensions-except',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-pings',
      '--window-size=1920,1080',
      `--user-agent=${this.getRandomUserAgent()}`
    ];
  }
}

module.exports = FingerprintRandomizer;