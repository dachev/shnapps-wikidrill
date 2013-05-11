var about = [
  {
    name  : 'require',
    items : [
      {name:'express',    link:'https://github.com/visionmedia/express'},
      {name:'ejs',        link:'https://github.com/visionmedia/ejs'},
      {name:'request',    link:'https://github.com/mikeal/request'},
      {name:'underscore', link:'https://github.com/documentcloud/underscore'}
    ]
  },
  {
    name  : 'credits',
    items : [
      {name:'icons',   link:'http://www.deleket.com/softscraps.html'},
      {name:'buttons', link:'http://www.webdesignerwall.com/demo/css-buttons.html'},
      {name:'bubbles', link:'http://boedesign.com/blog/2009/07/11/growl-for-jquery-gritter/'},
      {name:'xul.css', link:'http://infrequently.org/2009/08/css-3-progress/'}
    ]
  }
];

module.exports = {
  name   : 'wikidrill',
  rest   : null,
  about  : about,
  init   : init
};

function init(server, pubsub) {
  var express = require('express');
  var ejs     = require('ejs');
  var drill   = require('./modules/drill');
  var config  = require('./config')[server.settings.env] || null;
  var rest    = express.createServer();
  
  rest.use(express.static(__dirname + '/public'));
  
  // configure views
  rest.set('views', __dirname + '/views');
  rest.register('.html', ejs);
  rest.set('view engine', 'html');
  rest.helpers({
    rootPath: server.settings.views
  });
  
  rest.get('/', function(req, res, next) {
    res.render('index', {about:about});
  });
  
  var client = pubsub.getClient();
  client.subscribe('/wikidrill/users/request/*', function(message) {
    if (!message.start_term || !message.end_term) {
      var channel = '/wikidrill/users/request/' + message.guid;
      var msg     = {
        type : 'error',
        msg  : 'Start or end page is missing or invalid'
      };
      
      return client.publish(channel, msg);
    }
    
    drillWikipedia(config, drill, client, message.guid, message.start_term, message.end_term);
  });
  
  module.exports.rest = rest;
}

    
function drillWikipedia(config, drill, client, guid, startTerm, endTerm) {
  var probe   = drill.probe(config, startTerm, endTerm);
  var channel = '/wikidrill/users/response/' + guid;
  
  probe.on('data', function(item) {
    var msg = {
      type : 'item',
      item : item
    };
    
    return client.publish(channel, msg);
  });
  
  probe.on('error', function(data) {
    var msg = {
      type  : 'error',
      msg   : data.msg || 'Unknow server error',
      stack : data.stack
    };
    
    return client.publish(channel, msg);
  });
  
  probe.on('complete', function(data) {
    var msg = {
      type  : 'success',
      msg   : data.msg || '',
      stack : data.stack
    };
    
    return client.publish(channel, msg);
  });
}