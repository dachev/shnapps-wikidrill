module.exports = {
  development : {
    services : {
      scrape : {
        url : 'http://localhost:8002/scrape/api/v1/scrape'
      }
    }
  },
  staging : {
    services : {
      scrape : {
        url : 'http://dev.shnapps.dachev.com/scrape/api/v1/scrape'
      }
    }
  },
  production : {
    services : {
      scrape : {
        url : 'http://shnapps.dachev.com/scrape/api/v1/scrape'
      }
    }
  }
};