
//Get user media polyfill
if (!navigator.mediaDevices) navigator.mediaDevices = {};
    navigator.mediaDevices.getUserMedia = navigator.mediaDevices.getUserMedia || (function () {
    // returns a getUserMedia function
    var getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    return function (constraints) {
        if (!getUserMedia) {
            return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
        }
        return new Promise(function (resolve, reject) {
            getUserMedia.call(navigator, constraints, resolve, reject);
        });
    };
})();

(function (speechRecognition) {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || SpeechRecognition;
})(window.SpeechRecognition || window.webkitSpeechRecognition);

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;

var pcConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
};
const dataChannelOptions = {
    ordered: false, // do not guarantee order
    maxPacketLifeTime: 3000, // in milliseconds
};
var constraints = {
    video: true
};
var sdpConstraints = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
};
var room = 'foo';
var socket;

var closeButton = document.getElementById("close");
    closeButton.addEventListener("click", function () {
        document.getElementById("videocontainer").style.display = "none";
        chatbutton.style.display = "";
    });

var chatbutton = document.getElementById("chatbutton");
    chatbutton.addEventListener("click", function(){
       document.getElementById("videocontainer").style.display = "";
       this.style.display = "none";
    });

///////////////////////////// video creation
var localVideo = document.createElement("video");
    localVideo.muted = true;
    localVideo.autoplay = true;
var localVideoContainer = document.createElement("div");
    localVideoContainer.appendChild(localVideo);
var remoteVideo = document.createElement("video");
    remoteVideo.autoplay = true;
var remoteVideoContainer = document.createElement("div");
    remoteVideoContainer.appendChild(remoteVideo);
var remoteVideoButtonContainer = document.createElement("div");

var fullscreenButton = document.createElement("button");
    fullscreenButton.addEventListener("click",function () {
        if (remoteVideoContainer.requestFullscreen) {
            remoteVideoContainer.requestFullscreen();
        } else if (remoteVideoContainer.mozRequestFullScreen) { /* Firefox */
            remoteVideoContainer.mozRequestFullScreen();
        } else if (remoteVideoContainer.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
            remoteVideoContainer.webkitRequestFullscreen();
        } else if (remoteVideoContainer.msRequestFullscreen) { /* IE/Edge */
            remoteVideoContainer.msRequestFullscreen();
        }
    });
var fullscreenIcon = document.createElement("i");
    fullscreenIcon.className = "fas fa-expand";
fullscreenButton.appendChild(fullscreenIcon);
remoteVideoButtonContainer.appendChild(fullscreenButton);
remoteVideoContainer.appendChild(remoteVideoButtonContainer);

var volumeButton = document.createElement("button");
volumeButton.addEventListener("click",function () {
    if(volumeSlider.style.display === ""){
        volumeSlider.style.display = "none";
    } else {
        volumeSlider.style.display = "";
    }

});
var volumeIcon = document.createElement("i");
volumeIcon.className = "fas fa-volume-up";
volumeButton.appendChild(volumeIcon);
remoteVideoButtonContainer.appendChild(volumeButton);
remoteVideoContainer.appendChild(remoteVideoButtonContainer);

var volumeSlider = document.createElement("input");
    volumeSlider.setAttribute("type","range");
    volumeSlider.setAttribute("min","1");
    volumeSlider.setAttribute("max","100");
    volumeSlider.className = "slider";
    volumeSlider.style.display = "none";

remoteVideoButtonContainer.appendChild(volumeSlider);

var videocontainer = document.getElementById("videos");
videocontainer.appendChild(localVideoContainer);
videocontainer.appendChild(remoteVideoContainer);

var backButton = document.getElementById("back");
backButton.addEventListener("click", function () {
    videocontainer.className = "videosInvisible";
});

$('#disconnect').click(function(){
    socket.disconnect();
});
$('#videocall').click(function(){
    videocontainer.className = "videosVisible";
    // socket.socket.reconnect();
    //socket = io.connect('http://localhost:3000',{'force new connection':true });
    socket =  io.connect();
    //socket = io.connect('http://localhost:8443',{'forceNew':true });
    socket.on('connect', function(msg){
        socket.emit('join', prompt('your name?'));
        window.scrollTo(0, document.body.scrollHeight);
    });

    socket.on('disconnection', function(msg){
        console.log("somebody disconnected")
        window.scrollTo(0, document.body.scrollHeight);
    });

    if (room !== '') {
        socket.emit('create or join', room);
        console.log('Attempted to create or  join room', room);
    }

    socket.on('created', function(room) {
        console.log('Created room ' + room);
        isInitiator = true;
    });

    socket.on('full', function(room) {
        console.log('Room ' + room + ' is full');
    });

    socket.on('join', function (room){
        console.log('Another peer made a request to join room ' + room);
        console.log('This peer is the initiator of room ' + room + '!');
        isChannelReady = true;
    });

    socket.on('joined', function(room) {
        console.log('joined: ' + room);
        isChannelReady = true;
    });

    socket.on('log', function(array) {
        console.log.apply(console, array);
    });


    function sendMessage(message) {
        console.log('Client sending message: ', message);
        socket.emit('message', message);
    }

    // This client receives a message
    socket.on('message', function(message) {
        console.log('Client received message:', message);
        if (message === 'got user media') {
            maybeStart();
        } else if (message.type === 'offer') {
            if (!isInitiator && !isStarted) {
                maybeStart();
            }
            pc.setRemoteDescription(new RTCSessionDescription(message));
            doAnswer();
        } else if (message.type === 'answer' && isStarted) {
            pc.setRemoteDescription(new RTCSessionDescription(message));
        } else if (message.type === 'candidate' && isStarted) {
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: message.label,
                candidate: message.candidate
            });
            pc.addIceCandidate(candidate);
        } else if (message === 'bye' && isStarted) {
            handleRemoteHangup();
        }
    });

    navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
    }).then(gotStream).catch(function(e) {
        alert('getUserMedia() error: ' + e.name);
    });

    function gotStream(stream) {
        console.log('Adding local stream.');
        localStream = stream;
        localVideo.srcObject = stream;
        sendMessage('got user media');
        if (isInitiator) {
            maybeStart();
        }
    }


    console.log('Getting user media with constraints', constraints);
    if (location.hostname !== 'localhost') {
        requestTurn(
            'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
        );
    }

    function maybeStart() {
        console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
        if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
            console.log('>>>>>> creating peer connection');
            createPeerConnection();
            pc.addStream(localStream);
            isStarted = true;
            console.log('isInitiator', isInitiator);
            if (isInitiator) {
                doCall();
            }
        }
    }

    window.onbeforeunload = function() {
        sendMessage('bye');
    };

    /////////////////////////////////////////////////////////


    function createPeerConnection() {
        try {
            pc = new RTCPeerConnection(null);
            pc.onicecandidate = handleIceCandidate;
            pc.onaddstream = handleRemoteStreamAdded;
            pc.onremovestream = handleRemoteStreamRemoved;
            console.log('Created RTCPeerConnnection');
            // Establish your peer connection using your signaling channel here
            const dataChannel =
                pc.createDataChannel("myLabel", dataChannelOptions);

            dataChannel.onerror = (error) => {
                console.log("Data Channel Error:", error);
            };

            dataChannel.onmessage = (event) => {
                console.log("Got Data Channel Message:", event.data);
            };

            dataChannel.onopen = () => {
                dataChannel.send("Hello World!");
            };

            dataChannel.onclose = () => {
                console.log("The Data Channel is Closed");
            };


        } catch (e) {
            console.log('Failed to create PeerConnection, exception: ' + e.message);
            alert('Cannot create RTCPeerConnection object.');
            return;
        }
    }

    function handleIceCandidate(event) {
        console.log('icecandidate event: ', event);
        if (event.candidate) {
            sendMessage({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        } else {
            console.log('End of candidates.');
        }
    }

    function handleCreateOfferError(event) {
        console.log('createOffer() error: ', event);
    }

    function doCall() {
        console.log('Sending offer to peer');
        pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
    }

    function doAnswer() {
        console.log('Sending answer to peer.');
        pc.createAnswer().then(
            setLocalAndSendMessage,
            onCreateSessionDescriptionError
        );
    }

    function setLocalAndSendMessage(sessionDescription) {
        pc.setLocalDescription(sessionDescription);
        console.log('setLocalAndSendMessage sending message', sessionDescription);
        sendMessage(sessionDescription);
    }

    function onCreateSessionDescriptionError(error) {
        trace('Failed to create session description: ' + error.toString());
    }

    function requestTurn(turnURL) {
        var turnExists = false;
        for (var i in pcConfig.iceServers) {
            if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
                turnExists = true;
                turnReady = true;
                break;
            }
        }
        if (!turnExists) {
            console.log('Getting TURN server from ', turnURL);
            // No TURN server. Get one from computeengineondemand.appspot.com:
            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    var turnServer = JSON.parse(xhr.responseText);
                    console.log('Got TURN server: ', turnServer);
                    pcConfig.iceServers.push({
                        'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                        'credential': turnServer.password
                    });
                    turnReady = true;
                }
            };
            xhr.open('GET', turnURL, true);
            xhr.send();
        }
    }

    function handleRemoteStreamAdded(event) {
        console.log('Remote stream added.');
        remoteStream = event.stream;
        remoteVideo.srcObject = remoteStream;
    }

    function handleRemoteStreamRemoved(event) {
        console.log('Remote stream removed. Event: ', event);
    }

    function hangup() {
        console.log('Hanging up.');
        stop();
        sendMessage('bye');
    }

    function handleRemoteHangup() {
        console.log('Session terminated.');
        stop();
        isInitiator = false;
    }

    function stop() {
        isStarted = false;
        pc.close();
        pc = null;
        document.getElementById("#videocontainer").parentElement.removeChild(document.getElementById("#videocontainer"));
    }

    $('form').submit(function(){
        let msg = $('#m').val();
        socket.emit('chatmessage', msg);
        $('#m').val('');
        $('#messages').append($('<div class="currentuser">').text(msg));
        return false;
    });
    socket.on('chatmessage', function(msg){
        $('#messages').append($('<div class="anotheruser">').text(msg));
        speak(msg);
        window.scrollTo(0, document.body.scrollHeight);
    });

    var synth = window.speechSynthesis;
    function speak(message) {
        synth.speak(new SpeechSynthesisUtterance(message))
    }


    //Speech Recognition stuff
    function createRecognition(){
        let recognizer = new SpeechRecognition();
        recognizer.lang = 'en-US';
        recognizer.interimResults = false;
        recognizer.continuous = true;
        recognizer.maxAlternatives = 1;

        let counter = 0;
        recognizer.onresult = e => {
            console.log(e.results);
            let result = e.results[counter][0].transcript;
            console.log(result);
            let elem = document.createElement('span');
            elem.innerText = result;
            document.body.appendChild(elem);
            counter++;
            socket.emit('chatmessage', result);
            recognizer.stop();
            createRecognition();
        };
        recognizer.start();

    }

    createRecognition();

    // recognizer.onerror = (event) => console.log('error', event);
    // recognizer.onnomatch = (event) => console.log('nomatch', event);
    // recognizer.onaudiostart = (event) => console.log('audiostart', event);
    // recognizer.onaudioend = (event) => console.log('audioend', event);
    // recognizer.onend = (event) => {
    //     recognizer.stop();
    //     console.log('end', event);
    //     if(shouldContinue){
    //         recognizer.start();
    //     }
    // };
    // recognizer.onstart = (event) => console.log('start', event);
    // recognizer.onsoundstart = (event) => console.log('soundstart', event);
    // recognizer.onsoundend = (event) => console.log('soundend', event);
    // recognizer.onspeechstart = (event) => console.log('speechstart', event);
    // recognizer.onspeechend = (event) => console.log('speechend', event);

    //recognizer.start();

});
