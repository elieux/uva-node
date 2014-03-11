#!/usr/bin/env node

process.exit = require('exit');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const sprintf = require('sprintf').sprintf;
const util = require('./util');
const Account = require('./account');
const Adapter = require('./adapter');
const App = require('./app');

const SETTING_FILE_NAME = ".uva-node";
const SETTING_PATH = path.join(util.getUserHomePath(), SETTING_FILE_NAME);

var app = new App();

if (fs.existsSync(SETTING_PATH))
{
    app.load(SETTING_PATH);
}
else
{
    console.log('Setting file not found: %s', SETTING_PATH);
    console.log('A new one will be auto-created after exiting the program');
}

process.on('exit', saveSetting);

var args = process.argv.splice(2);
var interactive = args.length === 0;

if (! interactive)
{
    executeLine(args.join(' '), function(){
        process.exit(0);
    });
    return;
}

var rl = readline.createInterface(process.stdin, process.stdout);

rl.on('line', function(line){
    executeLine(line, function (quitting){    
        if (quitting)
        {
            rl.close();
            return;
        }

        console.log();
        rl.prompt();
    });
})
.on('close', function() {
    console.log('Have a great day!');
    process.exit(0);
});
rl.setPrompt('> ');
rl.prompt();

function saveSetting()
{
    app.save(SETTING_PATH);
}

function printStatus(subs)
{
    console.log("Sub Id    | Prob # |      Verdict     |  Lang  | Runtime |  Rank |      Sub Time");
    //           123456789---123456---1234567890123456---123456---1234567---12345---yyyy-mm-dd hh:mm:ss

    var hasColors = process.stdout.isTTY;
    var formatStr = "%9d   %6d   %"+(hasColors ? 26 : 16)+"s   %6s   %3d.%03d   %5s   %4d-%02d-%02d %02d:%02d:%02d"; 
    var verdictKey = hasColors ? 'coloredLabel' : 'label';

    var date = new Date();
    for (var i = 0; i < subs.length;i++)
    {
        var sub = subs[i];
        var subId = sub[0];
        var probId = sub[1];
        var verdict = sub[2];
        var runtime = sub[3];
        var time = sub[4]; // in millisec
        var lang = sub[5];
        var rank = sub[6];

        date.setTime(time);
        console.log(sprintf(formatStr,
            subId, probId, verdict[verdictKey],
            lang, Math.floor(runtime/1000), runtime%1000,
            rank < 0 ? '-' : rank > 9999 ? '>9999' : rank,
            date.getFullYear(), date.getMonth()+1, date.getDate(),
            date.getHours(), date.getMinutes(), date.getSeconds()));
    }
}

function getCurrentAdapter()
{ 
    var curAdap = app.getCurrentAdapter();
    if (curAdap) return curAdap;

    console.log('No current account selected');
}

function printError(e)
{
    console.log('Error: ' + (e.message || e));
}

function executeLine(line, doneFn) 
{
    var toks;
    try
    {
        toks = util.parseArgs(line);
    }
    catch (e)
    {
        printError(e);
        doneFn();
        return;
    }

    var action = toks[0].toLowerCase();

    function checkToks(argsCount, syntax)
    {
        if (toks.length !== argsCount+1)
        {
            console.log('Syntax: %s', syntax);
            return false;
        }

        return true;
    }

    function tplHandle(subAction)
    {
        switch(subAction)
        {
        case 'add':
            if (toks.length <= 2)
            {
                console.log('Syntax: tpl add <filePath>');
                break;
            }

            var ok = app.getTemplateManager().add(toks[2]);
            if (ok)
                console.log('Added or replaced existing template');
            else
                console.log('Cannot detect language');

            break;

        case 'remove':
            if (toks.length <= 2)
            {
                console.log('Syntax: tpl remove <lang>');
                break;
            }

            var lang = util.getLang(toks[2]);
            if (lang < 0)
            {
                console.log('Unknown language');
                break;
            }

            app.getTemplateManager().remove(lang);
            break;

        case 'show':
            console.log('lang     | file path');
            //           12345678---
            var tpls = app.getTemplateManager().getAll();
            for (var key in tpls)
            {
                var path = tpls[key];
                if (!path) continue;
                console.log(sprintf('%-8s   %s', util.getLangName(key), path));
            }
            break;

        default:
            console.log('unknown sub action');
        }
    }

    switch(action) 
    {
    case 'exit':
    case 'quit':
        doneFn(true);
        return;

    case 'view':
        var curAdap = getCurrentAdapter();
        if (!curAdap) break;
        if (!checkToks(1, 'view <prob #>')) break;
        
        curAdap.getProblemURL(toks[1], function(e, url){
            if (url)
            {
                try 
                {
                    app.openBrowser(url);
                }
                catch (e)
                {
                    printError(e);
                }
            }
            else
                console.log('Problem not found'); 
            
            doneFn();
        });
        
        return;

    case 'set-browser':
        if (toks.length < 2)
        {
            console.log('Syntax: set-browser <path> [<arg1> <arg2> ...]');
            break;
        }

        app.setBrowser(toks[1], toks.slice(2));
        console.log('Browser set');
        break;

    case 'get-browser':
        var opts = app.getBrowser();
        process.stdout.write('Command: '+opts.path+' <url>');

        for (var i=0;i<opts.args.length;i++)
        {
            process.stdout.write(' ');
            process.stdout.write(opts.args[i]);
        }
        console.log();
        break;

    case 'set-editor':
        if (!checkToks(1, 'set-editor <editor path>')) break;
        app.setEditor(toks[1]);
        console.log('Editor set');
        break;

    case 'edit':
        if (!checkToks(1, 'edit <file path>')) break;
        app.edit(toks[1], function(e){
            if (e)
                console.log('Cannot edit: '+e.message);
            else
                console.log('Edit done');
            doneFn();
        });
        return;

    case 'tpl':
        if (toks.length <= 1)
        {
            console.log('Syntax: tpl add <filePath> OR tpl remove <lang> OR tpl show');
            break;
        }

        var subAction = toks[1].toLowerCase();
        tplHandle(subAction);
        break;

    case 'send':
        var curAdap = getCurrentAdapter();
        if (!curAdap) break;

        var probNum, filePath;

        if (toks.length == 2)
        {
            var input = toks[1]; // can be prob# or filePath
            if (fs.existsSync(input))
            {
                probNum = curAdap.inferProbNum(input);
                filePath = input;
                if (!probNum)
                {
                    console.log('file "%s" exists, but cannot infer problem number.', input);
                    break;
                }
            }
            else
            {
                var files = curAdap.findFileNames(input);
                if (files.length == 0)
                {
                    console.log('Cannot find source files in current directory for problem: %s', input);
                    break;
                }

                if (files.length > 1)
                {
                    console.log('Multiple source files found: "%s", "%s", ...', files[0], files[1]);
                    break;
                }

                filePath = files[0];
                probNum = input;
            }

            console.log('Inferred Problem #: %s', probNum);
            console.log('       Source file: %s', filePath);
        }
        else if (toks.length == 3)
        {
            probNum = toks[1];
            filePath = toks[2];
        }
        else 
        {
            checkToks(2, 'send <prob#> <fileName/Path>');
            break;
        }
        
        try
        {
            console.log('Logging in...');
            curAdap.login(function(e){
                if (e)
                {
                    console.log('Login error: '+e.message);
                    doneFn();
                    return;
                }

                console.log('Sending code...');
                curAdap.send(probNum, filePath, function(e){
                    if (e)
                        console.log('send failed: '+e.message);
                    else
                        console.log('Send ok');
                    doneFn();
                });    
            });

            return;
        }
        catch (e)
        {
            console.log('Send error: '+e.message);
        }
        break;

    case 'use':
        if (toks.length === 3)
        {
            try {
                app.use(toks[1], toks[2]);
                console.log('Account set as current');
            }
            catch (e){
                printError(e);
            }
        }
        else if (toks.length === 1)
        {
            app.useNone();
            console.log('Current account set to none');
        }
        else
            checkToks(2, 'use <type> <userName> OR use');

        break;

    case 'add':
        // use traditional space-splitting in case password has quote chars.
        toks = line.trim().split(/\s+/g);
        if (! checkToks(3, 'add <type> <userName> <password>')) break;
        
        var normType = Adapter.normalizeType(toks[1]);
        if (!normType)
        {
            console.log('invalid type');
            break;
        }

        var acct = new Account({type: toks[1], user: toks[2], pass: toks[3]});
        var replaced = app.add(acct);
        if (replaced)
            console.log('An existing account was replaced');
        else
            console.log('Account added successfully');
        
        break;

    case 'remove':
        if (!checkToks(2, 'remove <type> <userName>')) break;

        try {
            app.remove(toks[1], toks[2]);
            console.log('Account removed');
        }
        catch(e) {
            printError(e);
        }
        
        break;

    case 'show':
        var size = app.size();

        if (!size)
        {
            console.log('No accounts');
            break;
        }   

        console.log('      type     | user');
        //           12345678901234---1234

        for (var i=0;i < size; i++)
        {
            var acct = app.get(i);
            console.log(sprintf("%-14s   %s", acct.type(), acct.user()));
        }

        break;

    case 'stat':
    case 'status':
        var curAdap = getCurrentAdapter();
        if (!curAdap) break;
        
        var num = 10;
        if (toks.length == 2) 
        {
            num = parseInt(toks[1]);
            if (num <= 0 || isNaN(num))
            {
                console.log('must be positive integer');
                break;
            }
        }
        else if (toks.length !== 1)
        {
            console.log('Syntax: stat/status <count>');
            break;
        }

        console.log('Getting status...');
        curAdap.fetchStatus(num, function(e, subs){
            if (e)
                console.log('Status error: '+e.message);
            else
                printStatus(subs);
            doneFn();
        });

        return;

    default:
        console.log('Unrecognized action');
        break;
    }

    doneFn();
}

