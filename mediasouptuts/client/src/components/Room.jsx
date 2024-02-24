import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import { Device } from "mediasoup-client";
import EmojiPicker, { Emoji } from "emoji-picker-react";

import data from "@emoji-mart/data";
import { SearchIndex } from "emoji-mart";
console.log("data", data);

const BASE_URL = "http://localhost:4000";

const socket = io(BASE_URL);

let device = new Device();

let producerTransport = null;
let consumerTransports = [];
let producer = null;
let producerId = null;
let isScreenShared = false;

let paramsmedia = {
  encodings: [
    {
      rid: "r0",
      maxBitrate: 100000,
      scalabilityMode: "S1T3",
    },
    {
      rid: "r1",
      maxBitrate: 300000,
      scalabilityMode: "S1T3",
    },
    {
      rid: "r2",
      maxBitrate: 900000,
      scalabilityMode: "S1T3",
    },
  ],

  codecOptions: {
    videoGoogleStartBitrate: 1000,
  },
};

const initialPollOptions = [
  { value: "", id: 1 },
  { value: "", id: 2 },
  { value: "", id: 3 },
  { value: "", id: 4 },
];
const Room = () => {
  const [roomId, setRoomId] = useState(null);
  const [meetId, setMeetId] = useState("");
  const [rtpCapabilities, setRtpCapabilities] = useState(null);

  const [consumers, setConsumers] = useState([]);

  const [poll, setPoll] = useState({});
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(initialPollOptions);

  const [consumerTransport, setConsumerTransport] = useState([]);

  const [screenStream, setScreenStream] = useState(null);
  const [isVideoShared, setIsVideoShared] = useState(false);
  const [videoStream, setVideoStream] = useState(null);
  const [isSharing, setIsSharing] = useState(false);

  const [peers, setPeers] = useState([]);
  const [emojis, setEmojis] = useState([]);

  const [chatMsg, setChatMsg] = useState("");
  const [chats, setChats] = useState([]);
  console.log("poll question", pollQuestion);
  console.log("poll option", pollOptions);

  const videoRef = useRef(null);
  const screenShareElementRef = useRef(null);
  const remoteVideoContainerRef = useRef(null);

  const containsEmoji = (text) => {
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/u;
    return emojiRegex.test(text);
  };

  const connectRecvTransport = async (
    consumerTransport,
    remoteProducerId,
    serverConsumerTransportId
  ) => {
    // emit consume to server
    await socket.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
      },
      async ({ params }) => {
        if (params.err) {
          console.log("error in consuming", params.err);
        }
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        }); // consume using params

        // this consumer contains track of the remote producer that is specified in remoteProducerId
        consumerTransports = [
          ...consumerTransports,
          {
            consumerTransport,
            serverConsumerTransportId: params.id,
            producerId: params.id,
            consumer,
          },
        ];

        setConsumers((prevConsumers) => [...prevConsumers, consumer]);
        console.log("consumer", consumer);
        console.log("consumer kind", consumer.kind);
        const videoElement = document.createElement("video");
        videoElement.setAttribute("id", `${remoteProducerId}`);
        videoElement.setAttribute("class", "remote-video");
        videoElement.style.width = "200px";
        videoElement.style.height = "200px";
        videoElement.muted = true;
        videoElement.autoplay = true;

        remoteVideoContainerRef.current.appendChild(videoElement);
        const { track } = consumer;

        document.getElementById(remoteProducerId).srcObject = new MediaStream([
          track,
        ]);
        socket.emit("consumer-resume", {
          serverConsumerId: params.serverConsumerId,
        });
      }
    );
  };

  const signalNewConsumerTransport = async (remoteProducerId) => {
    await socket.emit(
      "create-web-rtc-transport",
      { consumer: true },
      ({ params }) => {
        if (params.err) {
          console.log("error in creating consumer transport", params.err);
          return;
        }
        let consumerTransport;

        try {
          consumerTransport = device.createRecvTransport(params);
        } catch (err) {
          console.log("error in creating consumer transport", err);
          return;
        }
        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              await socket.emit("transport-recv-connect", {
                dtlsParameters,
                serverConsumerTransportId: params.id,
              });

              callback();
            } catch (err) {
              errback(err);
            }
          }
        );
        connectRecvTransport(consumerTransport, remoteProducerId, params.id);
      }
    );
  };
  const getProducers = async () => {
    socket.emit("getProducers", (producerIds) => {
      console.log("triggering get all producers", producerIds);
      // receive all producerIds from backend
      // for each producer signal consumer to consume their video audios
      producerIds.forEach(signalNewConsumerTransport);
    });
  };

  const createSendTransport = async () => {
    socket.emit(
      "create-web-rtc-transport",
      { consumer: false },
      async ({ params }) => {
        if (params.err) {
          console.log("error in creating send transport", params.err);
          return;
        }

        producerTransport = device.createSendTransport(params);
        console.log("producer transport", producerTransport);

        // connect fires when .produce function calls
        producerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            console.log("connect fired of producer");
            try {
              await socket.emit("transport-connect", { dtlsParameters });
              callback();
            } catch (err) {
              console.log("error in connect", err);
            }
          }
        );
        // calls after connect
        producerTransport.on(
          "produce",
          async (parameters, callback, errback) => {
            try {
              console.log("transport produced fired");
              await socket.emit(
                "transport-produce",
                {
                  kind: parameters.kind,
                  rtpParameters: parameters.rtpParameters,
                  appData: parameters.appData,
                },
                ({ id, producersExist }) => {
                  // here when client join first time they got the producer and consume their audios
                  // but if this client share like his screen then again this fires that again trying to consume the producer
                  console.log("producer exist", producersExist);
                  producerId = id;
                  // tell transport paramters were transmitted
                  callback({ id });
                  // getProducers();
                  // if (producersExist && !isScreenShared) {
                  //   // if someone does screen share it will again gives back all producers
                  //   getProducers(); // get all producers
                  // }
                }
              );
            } catch (err) {
              errback(err);
            }
          }
        );

        // connectSendTransport();
      }
    );
  };

  const connectSendTransport = async () => {
    console.log("connect send transport called!!");
    producer = producerTransport.produce(paramsmedia);
  };
  const sendScreenShare = async (stream) => {
    const track = stream.getVideoTracks()[0];
    producer = producerTransport.produce({ track: track });
  };
  const streamSuccess = (stream) => {
    // videoRef.current.srcObject = stream;
    setVideoStream(stream);
    const track = stream.getVideoTracks()[0];
    paramsmedia = {
      track,
      ...paramsmedia,
    };
  };

  const getLocalStream = async () => {
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          width: {
            min: 200,
            max: 200,
          },
          height: {
            min: 200,
            max: 200,
          },
        },
      })
      .then(streamSuccess)
      .catch((error) => {
        console.log(error.message);
      });
  };
  const createDevice = async (rtpCaps) => {
    try {
      await device.load({ routerRtpCapabilities: rtpCaps });
    } catch (err) {
      console.log("error in creating device", err);
    }
  };
  const createRoom = () => {
    // emitting join room event only in backend it will create a room if not already exists
    socket.emit("join-room", { identity: "Amit" }, async (response) => {
      if (response.error) {
        console.error("Error creating room:", response.error);
      } else {
        console.log("response", response);
        setRoomId(response.roomId);
        // set rtp capabilities
        setRtpCapabilities(response.rtpCapabilities);
        await createDevice(response.rtpCapabilities);
        // await getLocalStream();
        await createSendTransport();
        await getProducers(); // get all producers already there
      }
    });
  };

  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: {
            min: 300,
            max: 300,
          },
          height: {
            min: 300,
            max: 300,
          },
        },
      });
      setVideoStream(stream);
      setIsVideoShared(true);

      const track = stream.getVideoTracks()[0];

      producer = producerTransport.produce({ track: track });
    } catch (err) {}
    // setIsVideoShared(true);
    // await getLocalStream();
    // await connectSendTransport();
  };

  const joinRoom = () => {
    socket.emit(
      "join-room",
      { identity: "Test", roomId: meetId },
      async (response) => {
        if (response.error) {
          console.log("Error in join room", response.error);
        } else {
          setRoomId(response.roomId);
          setRtpCapabilities(response.rtpCapabilities);
          await createDevice(response.rtpCapabilities);
          // await getLocalStream();
          await createSendTransport();
          await getProducers();
        }
      }
    );
  };

  useEffect(() => {
    if (videoStream && isVideoShared) {
      videoRef.current.srcObject = videoStream;
    }
  }, [videoStream, isVideoShared]);

  useEffect(() => {
    const searchEmoji = async () => {
      const searchRes = await SearchIndex.search("anger");
      console.log("search res", searchRes);
    };
    searchEmoji();
  }, []);
  useEffect(() => {
    socket.on("connect", async () => {
      console.log("connected with socket server!!");
      // await getLocalStream();

      socket.on("new-producer", async ({ producerId }) => {
        console.log("new producer triggered!!");
        await signalNewConsumerTransport(producerId);
      });

      socket.on("room-update", (res) => {
        setPeers(res.peers);
      });
      socket.on("get-chat-msg", (res) => {
        console.log("res chat msg length", res.msg.length);

        setChats((prev) => [...prev, res.msg]);
      });
      socket.on("recv-poll", (res) => {
        console.log("poll res", res);
      });
      socket.on("producer-closed", ({ remoteProducerId }) => {
        document.getElementById(remoteProducerId).remove();
      });
    });
  }, []);

  const handleSentChatMessage = (e) => {
    console.log("triggered chat send msg");
    if (e.keyCode === 13) {
      console.log("e.target.value", e.target.value);
      socket.emit("chat-msg", { msg: e.target.value });
    }
  };

  const startScreenShare = async () => {
    try {
      // Get the user's screen stream
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });

      // Update the state with the screen stream
      setScreenStream(stream);
      // setIsSharing(true);
      isScreenShared = true;
      sendScreenShare(stream);
    } catch (err) {
      console.error("Error accessing screen:", err);
    }
  };

  const onClickEmoji = (emojiData, event) => {
    console.log("emoji data", emojiData);

    setChatMsg((prev) => prev + emojiData.emoji);
    // setEmojis(() => [...emojis, emojiData]);
  };

  // useEffect(() => {
  //   if (screenStream && isSharing) {
  //     console.log("screen stream", screenStream);
  //     screenShareElementRef.current.srcObject = screenStream;
  //   }
  // }, [screenStream, isSharing]);

  const renderEmojis = () => {
    return emojis
      .map((emoji) => {
        return emoji.emoji + "";
      })
      .join("");
  };

  const handleChatMsg = (e, idx) => {
    console.log("e", e);
    console.log("idx", idx);
    setChatMsg(e.target.value);
  };

  const startRecording = async () => {
    // we need to emit the recording to backend so that ffmpeg starts recording
    try {
      let prod = await producer;
      let producerId = prod.id;
      socket.emit("start-recording", { producerId: producerId });
      // socket.emit("start-recording",{producerId:})
    } catch (err) {
      console.log("err in start recording", err);
    }
  };

  const handleOptionChange = (index, event) => {
    console.log("index", index);
    const newOptions = pollOptions.map((option, idx) => {
      if (option.id === index + 1) {
        return { ...option, value: event.target.value };
      }
      return option;
    });
    setPollOptions(newOptions);
  };

  const sendPoll = (e) => {
    e.preventDefault();
    const createPoll = {
      question: pollQuestion,
      options: pollOptions,
    };
    setPollQuestion("");
    setPollOptions(initialPollOptions);

    socket.emit("send-poll", createPoll);
  };
  return (
    <>
      <h1>Room id : {roomId}</h1>

      <video ref={videoRef} autoPlay playsInline></video>

      {roomId && <button onClick={startVideo}>Start Video Producing</button>}
      {roomId && isVideoShared && (
        <button onClick={startRecording}>Start Recording</button>
      )}

      <div
        className="remote-videos-container"
        ref={remoteVideoContainerRef}
      ></div>

      <div>
        <button onClick={createRoom}>Create Room</button>

        <input
          type="text"
          value={meetId}
          onChange={(e) => {
            setMeetId(e.target.value);
          }}
          placeholder="Enter meet id"
        ></input>
        <button onClick={joinRoom}>Join Room</button>
        <Emoji unified="1f423" size="30" />

        {roomId && (
          <>
            <button onClick={startScreenShare}>Start screen Share</button>
            {/* {screenStream && isSharing && (
              <video
                style={{ width: "100px", maxHeight: "100px" }}
                autoPlay
                playsInline
                muted
                ref={screenShareElementRef}
              />
            )} */}
          </>
        )}

        <div>
          <p>Peers in this room:</p>
          <ul>
            {peers.map((peer, idx) => (
              <li key={idx}>{peer}</li>
            ))}
          </ul>
        </div>

        {roomId && (
          <div>
            <h1>Ask Poll</h1>
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="Enter your question"
            ></input>
            <div>Poll options</div>
            {pollOptions.map((opt, idx) => (
              <input
                type="text"
                value={opt.value}
                onChange={(event) => handleOptionChange(idx, event)}
              />
            ))}
            <button onClick={(e) => sendPoll(e)}>Ask Poll</button>
          </div>
        )}
        {roomId && (
          <div style={{ margin: "2rem" }}>
            <h1>Chat Box</h1>
            <div>
              <EmojiPicker onEmojiClick={onClickEmoji} />
            </div>
            <div style={{ margin: "1rem" }}>
              <ul>
                {chats.map((chat, idx) =>
                  chat.length === 2 && containsEmoji(chat) ? (
                    <>
                      {console.log("emoji triggered")}
                      <li key={idx} style={{ fontSize: "2rem" }}>
                        {chat}
                      </li>
                    </>
                  ) : (
                    <li key={idx}>{chat}</li>
                  )
                )}
              </ul>
            </div>

            <input
              type="text"
              value={chatMsg}
              onChange={handleChatMsg}
              onKeyDown={(e) => handleSentChatMessage(e)}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default Room;
