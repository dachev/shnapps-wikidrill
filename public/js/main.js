$(function() {
    var guid     = guid(),
        $doc     = $(document),
        $inputs  = $('input'),
        $submit  = $inputs.filter('[type="submit"]'),
        $status  = $('#status'),
        $result  = $('#result');
        template = _.template($('#item_template').text());
    
    initInputs();
    disableSubmit();
    showExample();
    
    var client = new Faye.Client(location.protocol + '//' + location.host + '/faye', {
        timeout:120
    });
    client.subscribe('/wikidrill/users/response/' + guid, function(data) {
        if (data.type == 'item' && data.type) {
            var html = template(data.item);
            return $result.addClass('nonempty').append(html);
        }
        
        enableSubmit();
        $submit.removeClass('working');
        $status.removeClass('working').addClass('done');
        $status.addClass(data.type).find('.message').html(data.message || '');
    });
    
    $doc.delegate('a', 'click', function(ev) {
        ev.preventDefault();
        
        var $this = $(this),
            href  = $this.attr('href');
        
        if (!href) { return; }
        
        window.open(href);
    });
    
    $doc.delegate('input', 'keyup change focus blur', function() {
        checkFormValid();
    });
    
    $doc.delegate('form', 'submit', function(ev) {
        ev.preventDefault();
        
        var $this  = $(this),
            args   = makeArgs(guid),
            action = $this.attr('action');
        
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            if (arg.value == '') {
                return false;
            }
        }
        
        disableSubmit();
        $submit.addClass('working');
        $result.removeClass('nonempty').html('');
        $status.removeClass('inactive done error warning success');
        $status.addClass('working').find('.message').html('');
        
        var channel = '/wikidrill/users/request/' + guid;
        client.publish(channel, args);
    });
    
    function showExample() {
        var start  = 'Human';
        var $input = $inputs.filter('#start_term');
        
        for (var i = 0; i < start.length; i++) (function(i) {
            setTimeout(function() {
                $input.val(start.slice(0, i));
            }, i*300);
        })(i+1);
        
        setTimeout(function() {
            $doc.find('form').submit();
        }, (i+2)*300);
    }
    
    function makeArgs(guid) {
        var args = {guid:guid};
        
        $inputs.filter('[type="text"]').each(function() {
            var $this  = $(this),
                name   = $this.attr('name'),
                value  = $this.val();
            
            args[name] = value;
        });
        
        return args;
    }
    
    function checkFormValid() {
        var invalidCount = 0;
        
        $inputs.filter('[type="text"]').each(function() {
            var $this  = $(this),
                value  = $this.val();
        
            if (value == '') {
                $this.addClass('invalid');
                disableSubmit();
                invalidCount++;
            }
            else {
                $this.removeClass('invalid');
            }
        });
        
        if (invalidCount == 0 && $submit.hasClass('working') == false) {
            enableSubmit();
        }
    }
    
    function disableSubmit() {
        $submit.
            addClass('disabled').
            attr('disabled', 'true');
    }
    
    function enableSubmit() {
        $submit.
            removeClass('disabled').
            attr('disabled', '');
    }
    
    function initInputs() {
        $inputs.filter('[type="text"]');
    }
    
    function guid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });
    }
});