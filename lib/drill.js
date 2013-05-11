var Url     = require('url');
var request = require('request');

Probe.prototype = new process.EventEmitter();
Probe.prototype.constructor = Probe;
function Probe(config, startTerm, endTerm) {
  var self    = this;
  var stack   = [];
  var counter = 0;
  var maxHops = 50;
  
  // give users a chance to attach "error" handlers
  process.nextTick(function() {
    if (startTerm.toLowerCase() == endTerm.toLowerCase()) {
      self.emit('error', {
        msg:'Start and end term must be different',
        stack:getTrace(stack)
      });
      
      return;
    }
    
    loadArticle(startTerm);
  });
  
  function loadArticle(currentTerm) {
    if (counter >= maxHops) {
      self.emit('error', {
        msg:'Maximum number of hops reached: ' + maxHops,
        stack:getTrace(stack)
      });
      
      return;
    }
    
    var editUrl = Url.format({
      protocol : 'http',
      hostname : 'en.wikipedia.org',
      pathname : '/w/index.php',
      query    : {title:currentTerm, action:'edit'}
    });
    
    var viewUrl = Url.format({
      protocol : 'http',
      hostname : 'en.wikipedia.org',
      pathname : '/wiki/' + currentTerm,
    });

    var script  = scrapePage.toString();
    var form    = {url:editUrl, script:script};
    var apiUrl  = config.services.scrape.url;
    var options = {url:apiUrl, json:true, form:form};

    request.post(options, function(err, res, json) {
      // error
      if (err || json == null || !json.success) {
        return self.emit('error', {
          msg:'Error loading ' + makeLink(viewUrl),
          stack:getTrace(stack)
        });
      }

      // success
      if (json.payload.exists === false) {
        return self.emit('error', {
          msg:'Error loading ' + makeLink(viewUrl),
          stack:getTrace(stack)
        });
      }

      var redirect = json.payload.redirect;
      var links    = json.payload.links;
      var title    = currentTerm.replace(/_/g, ' ');

      // done
      if (currentTerm.toLowerCase() == endTerm.toLowerCase()) {
        var item = {term:currentTerm, title:title, url:viewUrl, links:links};
        stack.push(item);
        self.emit('data', {item:{title:title, url:viewUrl}});
        
        self.emit('complete', {
          msg:'success',
          stack:getTrace(stack)
        });
        
        return;
      }
      
      var nextTerm = pickTerm(links);
      if (!nextTerm) {
        return self.emit('error', {
          msg:'Error finding an appropriate link in ' + makeLink(viewUrl),
          stack:getTrace(stack)
        });
      }
      
      if (redirect == false) {
        var item = {term:currentTerm, title:title, url:viewUrl, links:links};
        stack.push(item);
        self.emit('data', {item:{title:title, url:viewUrl}});
        counter++;
      }
      
      loadArticle(nextTerm);
    });
  }
  
  function pickTerm(links) {
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      
      if (isCircularTerm(link.id) == true) {
        continue;
      }
      
      return link.id;
    }
    
    return null;
  }
  
  function isCircularTerm(nextTerm) {
    for (var i = 0; i < stack.length; i++) {
      var visitedTerm = stack[i].term;
      if (nextTerm.toLowerCase() == visitedTerm.toLowerCase()) {
        return true;
      }
    }
    
    return false;
  }
  
  function makeLink(url) {
    return ['<a href="', url, '">', url, '</a>'].join('');
  }
  
  function getTrace(stack) {
    var trace = [];
    
    for (var i = 0; i < stack.length; i++) {
      var item = stack[i];
      
      trace.push({
        url   : item.url,
        title : item.title
      });
    }
    
    return trace;
  }

  function scrapePage() {
    function getParagraphs($, raw) {
      var raw   = raw.replace(/{{/g, '<template>').replace(/}}/g, '</template>');
      var raw   = $('<root>' + raw + '</root>').find('template').remove().end().html().trim();
      var depth = 0;
      var last  = '';
      var text  = '';
      
      // remove files
      for (var i = 0; i < raw.length; i++) {
        var current = raw.charAt(i);
        var next    = raw.charAt(i+1);
        
        if (current == '[' && next == '[' &&
          raw.charAt(i+2) == 'F' && raw.charAt(i+3) == 'i' &&
          raw.charAt(i+4) == 'l' && raw.charAt(i+5) == 'e') {
          
          depth++;
        }
        else if (current == '[' && next == '[' && depth > 0) {
          depth++;
        }
        else if (last == ']' && current == ']' && depth > 0) {
          depth--;
        }
        else if (depth == 0) {
          text += current;
        }
        
        last = current;
      }
      
      last  = '';
      raw   = text.trim();
      text  = '';
      depth = 0;
      
      // remove images
      for (var i = 0; i < raw.length; i++) {
        var current = raw.charAt(i);
        var next    = raw.charAt(i+1);
        
        if (current == '[' && next == '[' &&
          raw.charAt(i+2) == 'I' && raw.charAt(i+3) == 'm' &&
          raw.charAt(i+4) == 'a' && raw.charAt(i+5) == 'g' &&
          raw.charAt(i+6) == 'e') {
          
          depth++;
        }
        else if (current == '[' && next == '[' && depth > 0) {
          depth++;
        }
        else if (last == ']' && current == ']' && depth > 0) {
          depth--;
        }
        else if (depth == 0) {
          text += current;
        }
        
        last = current;
      }
      
      // remove files
      return $('<root>' + text + '</root>').find('ref').remove().end().html().trim();
    }
        
    function getInternalLinks(jQuery, text) {
      var links   = [];
      var matches = text.match(/\[\[[^\[\]]+\]\]/g) || [];
      
      for (var i = 0; i < matches.length; i++) {
        var match = matches[i].trim().replace('[[', '').replace(']]', '');
        
        if (match.indexOf('http://') >= 0) { continue; }
        if (match.indexOf('#') >= 0) { continue; }
        if (match.indexOf(':') >= 0) { continue; }
        
        if (match.indexOf('|') < 0) {
          var id   = match.replace(/\s/g, '_');
          var name = match;
          
          links.push({id:id, label:name});
          continue;
        }
        
        var pairs = match.split(/([^|]+)|([^|]+)/);
        if (pairs.length == 7) {
          var id   = (pairs[1]).replace(/\s/g, '_');
          var name = pairs[4];
          
          links.push({id:id, label:name});
          continue;
        }
      }
      
      return links;
    }

    var $doc     = $(window.document);
    var exists   = $doc.text().indexOf('does not have an article') < 0;
    var raw      = exists && $doc.find('textarea').html().replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '';
    var body     = exists && getParagraphs(jQuery, raw) || '';
    var redirect = /#REDIRECT/i.test(body);
    var links    = exists && getInternalLinks(jQuery, body) || [];

    return {exists:exists, redirect:redirect, links:links};
  }
}

function probe(config, startTerm, endTerm) {
  return new Probe(config, startTerm, endTerm);
};

module.exports = {
  probe:probe
}





