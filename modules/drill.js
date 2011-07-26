var Url    = require('url');
var Rest   = require('restler');
var nQuery = require('nquery');

Probe.prototype = new process.EventEmitter();
Probe.prototype.constructor = Probe;
function Probe(startTerm, endTerm) {
    var self        = this;
    var stack       = [];
    var counter     = 0;
    var maxHops     = 50;
    
    // give users a chance to attach "error" handlers
    process.nextTick(function() {
        if (startTerm.toLowerCase() == endTerm.toLowerCase()) {
            self.emit('error', {
                msg:'Start and end term must be different',
                stack:getTrace(stack)
            });
            
            return;
        }
        
        //loadPage(startUrl);
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
        
        var request = Rest.get(editUrl, {followRedirects:true});
        request.on('success', function(body) {
            var $ = nQuery.createHtmlDocument(body);
            
            if (!body || body.indexOf('does not have an article') >= 0) {
                return self.emit('error', {
                    msg:'Error loading ' + makeLink(viewUrl),
                    stack:getTrace(stack)
                });
            }
            
            var doc      = $.window.document;
            var $doc     = $(doc);
            var raw      = $doc.find('textarea').html().replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            var body     = getParagraphs(raw);
            var links    = getInternalLinks(body);
            var title    = currentTerm.replace(/_/g, ' ');
            var redirect = /#REDIRECT/i.test(body);
            
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
        
        request.on('error', function(data) {
            return self.emit('error', {
                msg:'Error loading ' + makeLink(viewUrl),
                stack:getTrace(stack)
            });
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
    
    function getParagraphs(raw) {
        var depth = 0;
        var last  = '';
        var text  = raw.replace(/{{/g, '<template>').replace(/}}/g, '</template>');
        
        // templates files
        var $    = nQuery.createHtmlDocument(text);
        var doc  = $.window.document;
        var $doc = $(doc);
        
        $doc.find('template').remove();
        text = $doc.find('body').html().trim();
        
        last  = '';
        raw   = text.trim();
        text  = '';
        depth = 0;
        
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
        var $    = nQuery.createHtmlDocument(text);
        var doc  = $.window.document;
        var $doc = $(doc);
        
        $doc.find('ref').remove();
        text = $doc.find('body').html().trim();
        
        return text;
    }
    
    function getInternalLinks(text) {
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
}

function probe(startTerm, endTerm) {
    return new Probe(startTerm, endTerm);
};

function Profiler() {
    var start = +new Date,
        count = 0;
    
    this.log = function(label) {
        var now = (+new Date);
        
        count++;
        var msg = count + ':' + (now - start);
        if (label) {
            msg += ' (' + label + ')';
        }
        
        console.log(msg);
        start = now;
    }
    
    this.finalize = function() {
        console.log('---------------------');
    }
}

module.exports = {
    probe:probe
}





