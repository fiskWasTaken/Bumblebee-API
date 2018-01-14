
var q = require('q');
var colors = require('colors');

// Database shit
const Fragment = require('../models/fragment');
const Word = require('../models/word');
const Source = require('../models/source');

// File stuff
const ffmpeg = require('fluent-ffmpeg');
const audioconcat = require('audioconcat');
const guid = require('guid');

var Engine = function () {
	// this.blackmagic('please let this work');
	//this.blackmagic('gas gas gas');
};

Engine.prototype.blackmagic = function (input, res) {

	var me = this;
	var deferred = q.defer();
	var input = input.toLowerCase().split(' ');

	console.log('starting new blackmagic for:'.green, input.toString().yellow);

	let combinations = new Array();

	for (var start = 0; start < input.length; start++) {
		var phrase = "";
		for (var i = start; i < input.length; i++) {
			phrase = phrase + input[i] + " ";
			combinations.push(phrase.substring(0, phrase.length - 1));
		}
	}

	console.log("Combinations");
	console.log(combinations);

	// Find the words in the database
	Word.find({ text: combinations }).populate({ path: 'fragments', model: 'Fragment', populate: { path: 'word', model: 'Word' } }).populate({ path: 'fragments', model: 'Fragment', populate: { path: 'source', model: 'Source' } }).then(function (words) {

		if (words.length == 0) {
			deferred.reject({ status: 422, message: 'Could not find any matching words in the database' });
		}

		// Database results are not ordered, let's order them
		var orderedWords = new Array();
		for (var word of combinations) {
			var w = words.find(function (w) { return word == w.text; });
			if (w) { orderedWords.push(w); }
		}

		//console.log('ordered words:', orderedWords);

		var traces = me.trace(orderedWords);
		//console.log('traces:'.yellow, traces);

		// FYI: Traces are fragments
		function shuffle(a) {
			var j, x, i;
			for (i = a.length - 1; i > 0; i--) {
				j = Math.floor(Math.random() * (i + 1));
				x = a[i];
				a[i] = a[j];
				a[j] = x;
			}
		}

		shuffle(traces);

		traces.sort(function (a, b) {
			return b.length - a.length;
		});

		var randomTraces = traces;
		var inputToProcess = input;

		// console.log("===== Random Traces ======");
		// console.log(randomTraces);

		// console.log("===== Input ======");
		// console.log(inputToProcess);

		for (var traces of randomTraces) {

			if (inputToProcess.length == 0) { break; }

			// Build array of words from this specific trace so we can match it with the input
			var words = new Array();
			for (var trace of traces) {
				words.push(trace.word.text);
			}

			console.log("==== Words for trace =====");
			console.log(words)

			console.log('trying to remove:'.green, words, 'from'.green, inputToProcess);

			let tmp = [];

			if (words.length > 0) {
				// Find the first word
				let start = 0;
				let index = -1;
				while (inputToProcess.indexOf(words[0], start) >= 0) {
					let ind = inputToProcess.indexOf(words[0], start);
					// Sanity check
					if (inputToProcess.length >= (ind + words.length)) {
						let br = false;
						let indx = ind;
						for (var word of words) {
							if (inputToProcess[indx] == word) {
								indx = indx + 1;
							}
							else {
								br = true;
								break;
							}
						}
						if (!br) {
							start = ind + 1;
							index = ind;
						}
						start = ind + 1;
					}
					else {
						// Break the while loop
						start = ind + 1;
					}

					//console.log(start, index);
				}

				if (index >= 0) {
					// Replace words with fragments from inputToProcess
					inputToProcess.splice(index, words.length);

					// Use the whole fragment as one
					let fragment = traces[0]
					let lastFragment = traces[traces.length - 1];
					fragment.end = lastFragment.end;
					inputToProcess.splice(index, 0, fragment);
				}

			}

		}

		let path = "";
		return deferred.resolve(new Promise((resolve, reject) => {
			me.fileMagic(inputToProcess.filter(val => { return !(typeof (val) == "string") }), false).then((data) => {
				console.log(data);
				resolve(data);
			});
		}));

	}).catch(error => {
		console.error(error);
		deferred.reject({ status: 500, message: error });
	});

	return deferred.promise;
}

Engine.prototype.trace = function (words) {

	var traces = new Array();

	for (var i = 0; i < words.length; i++) {
		var word = words[i];
		var nextWord = words[i + 1];
		console.log('starting new trace for word'.green, word.text);

		for (var fragment of word.fragments) {
			var fragmentTraces = this.traceFragments(i, words, fragment);
			//console.log('fragmentTraces:', fragmentTraces);
			traces.push(fragmentTraces);
		}
	}

	// We want the ones with the most entries at the top of the array, so let's sort on length.
	traces.sort(function (a, b) {
		return b.length - a.length;
	});

	return traces;
}

Engine.prototype.traceFragments = function (index, words, fragment, traces) {
	// index = current word index
	// words = the word array
	// fragment = the current fragment we need to start a trace for
	// traces = array containing all the fragments we've traced

	var word = words[index];
	var nextWord = words[index + 1];
	if (!traces) {
		traces = new Array();
		traces.push(fragment);
	}

	console.log('tracing fragment'.yellow, fragment.id);

	if (nextWord) {
		for (var nextFragment of nextWord.fragments) {
			if (nextFragment.source.equals(fragment.source) && Number(nextFragment.start) > Number(fragment.start) && traces.filter(trace => (trace.id == nextFragment.id)).length == 0) {
				console.log(fragment.id, '(' + fragment.word.text + " " + fragment.start + ')', 'source is same as'.green, nextFragment.id, '(' + nextFragment.word.text + " " + nextFragment.start + ')', '('.yellow + fragment.source.id.toString().yellow + ')'.yellow);
				traces.push(nextFragment);
				this.traceFragments(index + 1, words, nextFragment, traces);
			}
		}
	}

	return traces;
}



Engine.prototype.fileMagic = function (fragments, debug) {

	// Generate temp files from fragments
	let tempFiles = new Array();

	let promises = fragments.map(function (fragment) {
		return new Promise(function (resolve, reject) {

			let filepath = __dirname + '/../audio/youtube/' + fragment.source.id.toString() + '.mp3';
			console.log(filepath);

			ffmpeg(filepath)
				.setStartTime(fragment.start)
				.setDuration(fragment.end - fragment.start)
				.output(__dirname + '/../audio/fragments/' + fragment.id + '.mp3')
				.on('end', function (err) {
					if (!err) {
						var order = fragments.indexOf(fragment);
						tempFiles.push({ order: order, file: fragment.id + '.mp3' });
						resolve();
						//console.log('conversion Done');
					}
				})
				.on('error', function (err) {
					console.log('ffmpeg error:', err);
					resolve();
				}).run();

		});
	});

	return Promise.all(promises).then(function () {

		function compare(a, b) {
			if (a.order < b.order)
				return -1;
			if (a.order > b.order)
				return 1;
			return 0;
		}
		tempFiles.sort(compare);

		// Audioconcat needs a non relative path. 
		let files = new Array();
		tempFiles.forEach(function (fragment) {
			files.push(__dirname + "/../audio/fragments/" + fragment.file);
		});

		console.log('temp files:', files);

		// Concatenate the temp fragment files into one big one
		let outputfilename = guid.create() + '.mp3';

		return new Promise((resolve, reject) => {
			audioconcat(files)
				.concat(__dirname + "/../audio/temp/" + outputfilename)
				.on('start', function (command) {
					console.log('ffmpeg process started:', command)
				})
				.on('error', function (err, stdout, stderr) {
					console.error('Error:', err)
					console.error('ffmpeg stderr:', stderr)
					resolve({ error: 'FFMpeg failed to process file:' });
					//res.status(500).json({ error: 'FFMpeg failed to process file:' });
				})
				.on('end', function () {
					console.log('Audio created in:'.green, "/audio/temp/" + outputfilename);
					resolve({ file: "/audio/temp/" + outputfilename, debug: debug, status: 200 });
					//res.json({ file: "/audio/temp/" + outputfilename, debug: debug });
				})

		});
	});
}



module.exports = new Engine();