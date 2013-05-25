var undefined = undefined;
var express   = require('express');
var _         = require('underscore');

var about = [
  {
    name  : 'require',
    items : [
      {name:'express',    link:'https://github.com/visionmedia/express'},
      {name:'utml',       link:'https://github.com/mikefrey/utml'},
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
  init   : initApp
};


// init functions
function initApp(server, pubsub) {
  var config = require('./config')[server.settings.env]||{};
  var rest   = express();
  
  rest.config = config;
  rest.set('env', server.settings.env);
  
  initExpress(config, rest, function(err) {
    initPubsub(config, pubsub, function(err) {});
  });
  
  module.exports.rest = rest;
}
function initExpress(config, rest, cb) {
  var utml = require('utml');
  
  rest.use(express.static(__dirname + '/public'));
  
  // configure views
  rest.set('views', __dirname + '/views');
  rest.set('view engine', 'html');
  rest.engine('html', utml.__express);
  
  // configure page routes
  rest.get('/', checkConfigured, pageGetIndex);
  
  // configure API routes
  
  cb(null);
}
function initPubsub(config, pubsub, cb) {
  var drill  = require('./lib/drill');
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
}


// route middleware
function checkConfigured(req, res, next) {
  if (!req.body) { req.body = {}; }
  
  if (isReady() == false) {
    return renderError(req, res, 500, {
      message:'This application is misconfigured'
    });
  }
  
  next();
}


// page endpoints
function pageGetIndex(req, res, next) {
  res.render('index', {
    locals : {
      rootPath : req.app.parent.settings.views,
      about    : about
    }
  });
}


// render helpers
function renderError(req, res, code, data) {
  if (req.url.indexOf('/api') == 0) {
    // JSON response
    renderJSONError(req, res, code, data);
  }
  else {
    // HTML response
    renderHTMLError(req, res, code, data);
  }
}
function renderJSONError(req, res, code, data) {
  res.status(code);
  res.json(_.extend({
    message : '',
    payload : ''
  }, data, {success:false}));
}
function renderHTMLError(req, res, code, data) {
  var viewPath = path.join(req.app.parent.settings.views, '500');
  
  res.status(code);
  res.render(viewPath, {
    locals : {
      status  : 500,
      request : req,
      msg     : data.message
    }
  });
}
function renderSuccess(req, res, data) {
  if (req.url.indexOf('/api') == 0) {
    // JSON response
    renderJSONSuccess(req, res, data);
  }
  else {
    // HTML response
    renderHTMLSuccess(req, res, data);
  }
}
function renderJSONSuccess(req, res, data) {
  res.status(200);
  res.json(_.extend({
    message : '',
    payload : ''
  }, data, {success:true}));
}
function renderHTMLSuccess(req, res, data) {
}


// miscellaneous
function isReady() {
  return true;
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

