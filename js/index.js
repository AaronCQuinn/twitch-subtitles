// required dom elements
const buttonEl = document.getElementById('button');
const messageEl = document.getElementById('message');
const titleEl = document.getElementById('real-time-title');

// set initial state of application variables
messageEl.style.display = 'none';
let isRecording = false;
let socket;
let recorder;

// runs real-time transcription and handles global variables
const run = async () => {
  if (isRecording) { // If the function is run and it is already recording.

    // If socket is true, send a JSON object to terminate session, close the socket, set it null.
    if (socket) { 
      socket.send(JSON.stringify({terminate_session: true}));
      socket.close();
      socket = null;
    }

    // If recorder is true when function is invoked, pause the recording, set it to null.
    if (recorder) {
      recorder.pauseRecording();
      recorder = null;
    }

    // If the function is invoked under normal circumstances (it isn't already running).
  } else {
    const response = await fetch('http://localhost:8000'); // get temp session token from server.js (backend)
    const data = await response.json(); // Await a session token from the backend.

    if (data.error) { // Alert if there's an error with getting the token.
      alert(data.error);
    }
    
    const { token } = data; // Deconstruct the token from the response.

    // establish wss with AssemblyAI (AAI) at 16000 sample rate
    socket = await new WebSocket(`wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`);

    // handle incoming messages to display transcription to the DOM
    const texts = {};
    socket.onmessage = (message) => {
      let msg = ''; // Empty msg.
      const res = JSON.parse(message.data); // Response from socket.

      // Add key to texts object called 'res.audio_start', with the value of the sentence from response.
      texts[res.audio_start] = res.text; 
      
      // Order the messages in the div in chronological order.
      const keys = Object.keys(texts);
      keys.sort((a, b) => a - b);
      for (const key of keys) {
        if (texts[key]) {
          msg += ` ${texts[key]}`;
        }
      }
      messageEl.innerText = msg;
    };

    // If there's an error on the socket, log it and close the socket.
    socket.onerror = (event) => {
      console.error(event);
      socket.close();
    }
    
    // Close the socket, set it null.
    socket.onclose = event => {
      console.log(event);
      socket = null;
    }

    socket.onopen = () => {
      messageEl.style.display = ''; // On socket opening, clear the div.
      navigator.mediaDevices.getUserMedia({ audio: true }) // Prompt the media device.
        .then((stream) => {
          recorder = new RecordRTC(stream, {
            type: 'audio',
            mimeType: 'audio/webm;codecs=pcm', // endpoint requires 16bit PCM audio
            recorderType: StereoAudioRecorder,
            timeSlice: 250, // set 250 ms intervals of data that sends to AAI
            desiredSampRate: 16000,
            numberOfAudioChannels: 1, // real-time requires only one channel
            bufferSize: 4096,
            audioBitsPerSecond: 128000,
            ondataavailable: (blob) => {
              const reader = new FileReader();
              reader.onload = () => {
                const base64data = reader.result;

                // audio data must be sent as a base64 encoded string
                if (socket) {
                  socket.send(JSON.stringify({ audio_data: base64data.split('base64,')[1] }));
                }
              };
              reader.readAsDataURL(blob);
            },
          });

          recorder.startRecording();
        })
        .catch((err) => console.error(err));
    };
  }

  isRecording = !isRecording;
  buttonEl.innerText = isRecording ? 'Stop' : 'Record';
  titleEl.innerText = isRecording ? 'Click stop to end recording!' : 'Click start to begin recording!'
};

buttonEl.addEventListener('click', () => run());
