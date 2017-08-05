const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const config = require('../config/database');
const User = require('../models/user');
const Fragment = require('../models/fragment');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const audioconcat = require('audioconcat');
const path = require('path');
const fs = require('fs');
const guid = require('guid');

router.post('/youtube', passport.authenticate('jwt', {session: false}), (req, res, next) => {
    
    let url = req.body.url;
    let id = url.replace('https://www.youtube.com/watch?v=', '');
    let filename = id + '.opus'
    let filepath = path.resolve(__dirname, '../youtube/' + filename);
    let publicfilepath = '/youtube/' + filename;

    fs.exists(filepath, (exists) => {
        if(!exists) {
            ffmpeg()
                .input(ytdl(url))
                .noVideo()
                .audioBitrate(64)
                .save(filepath)
                .on('error', console.error)
                .on('progress', function (progress) {
                    process.stdout.cursorTo(0);
                    process.stdout.clearLine(1);
                    process.stdout.write(progress.timemark);
                }).on('end', function () {
                    console.log("\r\nDone converting audio file", id);
                    res.json({url: publicfilepath});
                });
        }
        else {
            // TODO: Error handling
            Fragment.find({
                'id' : id,
                'wordCount': 1
            }, function(err, frags){

                let fragments = new Array();
                
                for(let frag of frags) {
                    fragments.push({_id: frag._id, start: frag.start, end: frag.end, word: frag.phrase});
                }

                res.json({url: publicfilepath, fragments: fragments});
            });
        }
    });
});


router.get('/fragments', passport.authenticate('jwt', {session: false}), (req, res, next) => {
    // If ID given, get id otherwise get all
    let id = req.query.id;
    
    // No ID given, show everything

    if(id) {
        
        // Get the fragments
        Fragment.find({ id : id }, function (err,frags) {
            if(err) {
                res.send(err);
            }
            else {

                let fragments = new Array();
                
                for(let frag of frags) {
                    fragments.push({_id: frag._id, start: frag.start, end: frag.end, word: frag.phrase});
                }

                res.json(fragments);
            }
        });     
    }
    else {
        Fragment.find({}, function (err,frags) {
            if(err){
                res.send(err);
            }else{
                res.json(frags);
            }
        });   
    }

    //res.json({ success: false });
});

router.post('/fragments', passport.authenticate('jwt', {session: false}), (req, res, next) => {
    
    let id = req.body.id;
    let fragments = req.body.fragments;

    console.log('Saving fragments for id:', id);

    let phrases = new Array();

	for (var start = 0; start < fragments.length; start++) {
        let phrase = "";
        let wordCount = 0;
		let startFragment = fragments[start];

		for (let i = start; i < fragments.length; i++) {
            let fragment = fragments[i];
            
            phrase = phrase + fragment.word.toLowerCase() + " ";
            wordCount++;

            if(!fragment._id) { // Don't push if it is already in the database
                phrases.push(new Fragment({
                    id: id,
                    start: startFragment.start,
                    end: fragment.end,
                    phrase: phrase.substring(0, phrase.length - 1),
                    reviewed: false,
                    wordCount: wordCount
                }));
            }

		}
	}

	// console.log('All possible phrases:');
    console.log(phrases);
    
    Fragment.insertMany(phrases)
		.then(function (mongooseDocuments) {
			res.json({ success: true });
		})
		.catch(function (err) {
            console.log(err);
			res.json({ success: false, error: err });
		});

    //res.json({success: false});
});

router.post('/tts', (req, res, next) => {

    let text = req.body.text.toLowerCase();
    console.log('tts:', text);

    // Split the given phrase into words and make all possible combinations of these words
    let words = text.toLowerCase().split(' ');
	let combinations = new Array();

	for (var start = 0; start < words.length; start++) {
		var phrase = "";
		for (var i = start; i < words.length; i++) {
			phrase = phrase + words[i] + " ";
			combinations.push(phrase.substring(0, phrase.length - 1));
		}
	}

    // Prepare database query 
    let results = new Array();
	let promises = combinations.map(function (phrase) {
		return new Promise(function (resolve, reject) {
			// Do query here and resolve or reject when done
			Fragment.findOne({ 'phrase': phrase }, (err, fragment) => {
				if (!err) {
					// console.log(err, fragment);
					if(fragment) {
						results.push(fragment);
					}
				}
				resolve();
			});
		});
	});

    // Execute database query
	Promise.all(promises).then(function () {

        // Sort on amount of words in one result first
        function compare(a, b) {
            if (a.phrase.split(' ').length > b.phrase.split(' ').length)
                return -1;
            if (a.phrase.split(' ').length < b.phrase.split(' ').length)
                return 1;
            return 0;
        }

        results.sort(compare);
        console.log('All matching results:', results);

        if(results.length == 0) {
            res.json({success: false, err: "No results found"});
            return;
        }

        // 
        let fragmentsToProcess = new Array();
        let textToProcess = text;

        for(let result of results) {

            if(textToProcess == "") {
                //return; // ?
            }

            console.log("Trying to match '" + result.phrase + "' on '" +  textToProcess + "'");
            
            let regex = new RegExp("\\b" + result.phrase + "\\b", 'gi')
            let regexOriginal = new RegExp("\\b" + result.phrase + "\\b", 'gi')

            let wat = regex.exec(textToProcess);
            // console.log('wat', wat)
            if(wat) {
                console.log("Found '" + result.phrase + "' at index:", wat.index);
                textToProcess = textToProcess.replace(result.phrase, '');
                
                // check if we have found a match before, if we so need to up the index
                let originalIndex = 0;
                for(let fragment of fragmentsToProcess) {
                    if(fragment.result.phrase == result.phrase) {
                        originalIndex++;
                        console.log('Found a match we had before, upping index to', originalIndex);
                    }
                }

                // Find index in original text to use for order
                console.log('original text:', text);
                let matches = [];
                while ((match = regexOriginal.exec(text))) {
                    //console.log(match);
                    matches.push(match);
                }
                
                console.log('matches in original text:', matches);

                let fragment = { 
                    order: matches[originalIndex].index,
                    result: result 
                };

                fragmentsToProcess.push(fragment);
            }
            
            console.log('Text left over to process:', textToProcess);

            
        }

        console.log('Fragments to process:', fragmentsToProcess);

        let processedFragments = new Array();
		let promises = fragmentsToProcess.map(function (fragment) {
            return new Promise(function (resolve, reject) {

                let filepath = __dirname  + '/../youtube/' + fragment.result.id + '.opus';

                ffmpeg(filepath)
                    .setStartTime(fragment.result.start)
                    .setDuration(fragment.result.end - fragment.result.start)
                    .output(__dirname  + '/../temp/' + fragment.result.phrase + '.opus')
                    .on('end', function(err) {
                        if(!err)
                        {
                            processedFragments.push({order: fragment.order, phrase: fragment.result.phrase, file: '/temp/' + fragment.result.phrase + '.opus'})
                            resolve();
                            //console.log('conversion Done');
                        }
                    })
                    .on('error', function(err){
                        console.log('ffmpeg error:', err);
                        // Intel keeps breaking it
                        resolve();
                    }).run();

            });
        });

        Promise.all(promises).then(function () {

            // Sort on order
            function compare(a, b) {
                if (a.order < b.order)
                    return -1;
                if (a.order > b.order)
                    return 1;
                return 0;
            }

            processedFragments.sort(compare);

            processedFragments.forEach(function(fragment) {
                console.log(fragment.order, ":", fragment.phrase);
            });

            let tempFiles = new Array();
            processedFragments.forEach(function(fragment) {
                tempFiles.push(__dirname + "/.." + fragment.file);
            });

            console.log('Concatting tempfiles into one file:', tempFiles);

            // concat all the temp fragment files into one
            let outputfilename = guid.create() + '.opus';
            audioconcat(tempFiles)
                .concat(__dirname + "/../fragments/" + outputfilename)
                .on('start', function (command) {
                    console.log('ffmpeg process started:', command)
                })
                .on('error', function (err, stdout, stderr) {
                    console.error('Error:', err)
                    console.error('ffmpeg stderr:', stderr)
                })
                .on('end', function () {

                    tempFiles.forEach(function(file) {
                        console.log('Deleting temp fragment file', file);
                        fs.unlink(file, function() {});
                    });

                    console.log('Audio created in:', "/fragments/" + outputfilename)
                    res.json({file: "/fragments/" + outputfilename});
                })

            //res.json(responses);
        }).catch(console.error);
	});
});

module.exports = router;