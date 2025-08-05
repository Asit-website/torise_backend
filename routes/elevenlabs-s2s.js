const { getWeather } = require("../utils");
const Conversation = require("../models/Conversation");

const service = ({ logger, makeService }) => {
  const svc = makeService({ path: '/elevenlabs-s2s' });

  svc.on('session:new', async (session, path) => {
    const {
      call_sid,
      account_sid,
      application_sid,
      direction,
      duration,
      from,
      host,
      remote_host,
      service_provider_sid,
      sip_callid,
      sip_parent_callid,
      sip_status,
      to,
      trace_id,
      trunk
    } = session;

    // Set attempted_at time
    session.locals = {
      ...session.locals,
      attempted_at: new Date().toISOString(),
      transcripts: [],
      logger: logger.child({ call_sid: session.call_sid }),
    };
    session.locals.logger.info({ session, path }, `new incoming call: ${session.call_sid}`);
    session.locals.startTime = new Date(); // Set at call attempt

    try {
      let conversation = await Conversation.findOne({ call_sid });

      if (!conversation) {
        conversation = new Conversation({
          call_sid,
          summary: {
            attempted_at: session.locals.attempted_at,
            account_sid,
            application_sid,
            direction,
            duration,
            from,
            host,
            remote_host,
            service_provider_sid,
            sip_callid,
            sip_parent_callid,
            sip_status,
            to,
            trace_id,
            trunk
          }
        });

        await conversation.save();
      }
    } catch (err) {
      logger.error({ err }, 'Error saving call metadata to Conversation');
    }

    // const agent_id = "agent_01jvk8vk6mfp9r0sv3w9e0wfc8";
    // const api_key = "sk_59e509921c07697927b57d63dff4d7b72851c2db30c30b3f";

    const agent_id = process.env.ELEVENLABS_AGENT_ID;
    const api_key = process.env.ELEVENLABS_API_KEY;

    session
      .on('/event', onEvent.bind(null, session))
      .on('/toolCall', onToolCall.bind(null, session))
      .on('/final', onFinal.bind(null, session))
      .on('close', onClose.bind(null, session))
      .on('error', onError.bind(null, session));

    if (!agent_id) {
      session.locals.logger.info('missing env ELEVENLABS_AGENT_ID, hanging up');
      session.hangup().send();
    } else {
      await session.answer();
      session.locals.answeredAt = new Date(); // Set at call answer
      session.locals.start_time = Date.now(); // ⬅️ Track start time

      session
        .pause({ length: 1 })
        .llm({
          vendor: 'elevenlabs',
          model: 'gpt-40',
          auth: {
            agent_id,
            ...(api_key && { api_key })
          },
          actionHook: '/final',
          eventHook: '/event',
          toolHook: '/toolCall',
          llmOptions: {
            input_sample_rate: 16000,
            output_sample_rate: 16000,
            conversation_initiation_client_data: {}
          }
        })
        .hangup()
        .send();
    }
  });
};

const onFinal = async (session, evt) => {
  const { logger } = session.locals;
  logger.info(`got actionHook: ${JSON.stringify(evt)}`);

  if (['server failure', 'server error'].includes(evt.completion_reason)) {
    if (evt.error.code === 'rate_limit_exceeded') {
      let text = 'Sorry, you have exceeded your open AI rate limits. ';
      const arr = /try again in (\d+)/.exec(evt.error.message);
      if (arr) {
        text += `Please try again in ${arr[1]} seconds.`;
      }
      session.say({ text });
    } else {
      session.say({ text: 'Sorry, there was an error processing your request.' });
    }
    session.hangup();
  }

  session.reply();
};

const onEvent = async (session, evt) => {
  const { logger } = session.locals;
  const call_sid = session.call_sid;
  logger.info(`got eventHook: ${JSON.stringify(evt)}`);

  let conversation = await Conversation.findOne({ call_sid });

  if (!conversation) {
    conversation = new Conversation({
      call_sid,
      conversation_id: evt.conversation_initiation_metadata_event?.conversation_id || '',
      events: []
    });
  }

  if (!conversation.conversation_id && evt.conversation_initiation_metadata_event?.conversation_id) {
    conversation.conversation_id = evt.conversation_initiation_metadata_event.conversation_id;
  }

  const eventData = {
    type: evt.type,
    agent_response: evt.agent_response_event?.agent_response || '',
    agent_response_time: evt.agent_response_event?.timestamp
      ? new Date(evt.agent_response_event.timestamp)
      : null,
    user_transcript: evt.user_transcription_event?.user_transcript || '',
    user_transcript_time: evt.user_transcription_event?.timestamp
      ? new Date(evt.user_transcription_event.timestamp)
      : null,
    raw: evt
  };

  conversation.events.push(eventData);

  try {
    await conversation.save();
    logger.info(`Conversation updated for call_sid: ${call_sid}`);
  } catch (err) {
    logger.error(`Error saving conversation: ${err.message}`);
  }

  // ✅ n8n webhook call
  try {
    await fetch('http://localhost:5678/webhook-test/jambonz-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_sid, event: evt }) // send call_sid too
    });
  } catch (error) {
    logger.error(`Failed to send event to n8n: ${error.message}`);
  }
};

const onToolCall = async (session, evt) => {
  const { logger } = session.locals;
  logger.info({ evt }, 'got toolHook');
  const { name, args, tool_call_id } = evt;
  const { location, scale = 'celsius' } = args;
  logger.info({ evt }, `got toolHook for ${name} with tool_call_id ${tool_call_id}`);

  try {
    const weather = await getWeather(location, scale, logger);
    logger.info({ weather }, 'got response from weather API');

    const data = {
      type: 'client_tool_result',
      tool_call_id,
      result: weather,
      is_error: false
    };

    session.sendToolOutput(tool_call_id, data);
  } catch (err) {
    logger.info({ err }, 'error calling geocoding or weather API');
    const data = {
      type: 'client_tool_result',
      tool_call_id,
      result: 'Failed to get weather for location',
      is_error: true
    };
    session.sendToolOutput(tool_call_id, data);
  }
};

const onClose = async (session, code, reason) => {
  const { logger } = session.locals;
  logger.info({ code, reason }, `session ${session.call_sid} closed`);

  const call_sid = session.call_sid;
  session.locals.endTime = new Date(); // Set at call end

  const summaryData = {
    attempted_at: session.locals.startTime,
    answered: session.answered || true,
    answered_at: session.locals.answeredAt || session.locals.startTime,
    application_sid: session.application_sid || '',
    call_sid: session.call_sid || '',
    direction: session.direction || '',
    duration: session.locals.endTime && (session.locals.answeredAt || session.locals.startTime)
      ? Math.floor((session.locals.endTime - (session.locals.answeredAt || session.locals.startTime)) / 60000)
      : null, // duration in minutes
    from: session.from || '',
    host: session.host || '54.236.168.131',
    remote_host: session.remote_host || '152.59.143.20',
    service_provider_sid: session.service_provider_sid || '',
    sip_callid: session.sip?.callid || '',
    sip_parent_callid: session.sip?.parent_callid || '',
    sip_status: session.sip?.status || '',
    terminated_at: session.locals.endTime,
    termination_reason: session.termination_reason || 'unknown',
    to: session.to || '',
    trace_id: session.trace_id || '',
    trunk: session.trunk || '',
    account_sid: session.account_sid || ''
  };

  try {
    await Conversation.updateOne(
      { call_sid },
      { $set: { summary: summaryData } }
    );
    logger.info(`Saved full summary for call_sid: ${call_sid}`);
  } catch (error) {
    logger.error(`Failed to update summary for call_sid ${call_sid}: ${error}`);
  }
};


const onError = (session, err) => {
  const { logger } = session.locals;
  logger.info({ err }, `session ${session.call_sid} received error`);
};

module.exports = service; 