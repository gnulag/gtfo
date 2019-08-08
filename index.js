const _ = require('lodash')
const fs = require('fs')
const irc = require('irc')
const url = require('url')

const debug = process.env.DEBUG ? console.log : _.noop

function tryLoadConfig() {
  try {
    return fs.readFileSync('./config.json')
  } catch {
    return fs.readFileSync('./config.example.json')
  }
}

const config = JSON.parse(tryLoadConfig())

config.url = url.parse(config.url)

config.secure = config.url.protocol === 'ircs:'

config.url.username = (config.url.auth || '').split(':')[0]
config.url.username = (config.url.auth || '').substring(0, config.url.auth.lastIndexOf(':'))

debug('Config:', config)

const client = new irc.Client(config.url.hostname, config.url.username, {
  userName: config.username || config.url.username,
  realName: config.realname || config.url.username,
  password: config.url.password,
  debug: process.env.DEBUG,
  port: config.url.port || (config.secure ? 6697 : 6667),
  secure: config.secure,
  channels: config.channels.map(_.property('name'))
})

client.kick = _.partial(client.send, 'kick').bind(client)
client.names = _.partial(client.send, 'names').bind(client)

let kickCount = 0
const timers = {}

function getChannel(channel) {
  return _.find(config.channels, { name: channel })
}

function getReason(nick, interval) {
  return `${nick} should've spoken up, they've been kicked after being idle for ${interval} seconds`
}

function getRank(channel, nick, cb) {
  client.whois(nick, ({ channels }) => {
    channels.find(v => {
      if (v.slice(1) === channel) {
        let rank = v[0].trim()
        return cb(rank)
      }
      cb()
    })
  })
}

function canKick(channel, nick, cb) {
  getRank(channel, client.nick, (selfRank) => {
    if (selfRank === '@') {
      return cb(true) // yes
    }

    if (selfRank !== '~') {
      return cb(false) // no
    }

    getRank(channel, nick, (nickRank) => {
      cb(selfRank === '~' && nickRank !== '@') // maybe
    })
  })
}

function resetTimer(channel, nick) {
  const { interval, whitelist } = getChannel(channel)
  if (nick === client.nick || (whitelist || []).includes(nick)) {
    return
  }
  if (!timers[channel]) {
    timers[channel] = {}
  }
  removeTimer(channel, nick)
  timers[channel][nick] = setTimeout(() => {
    canKick(channel, nick, (can) => {
      debug('trying to kick', nick, 'from', channel, 'can we?', can)
      if (!can) {
        resetTimer(channel, nick)
        return
      }
      kickCount++
      client.kick(channel, nick, getReason(nick, interval))
    })
  }, interval * 1000)
}

function removeTimer(channel, nick) {
  if (!timers[channel]) {
    return
  }
  clearTimeout(timers[channel][nick])
}

function removeMultiChannelTimers(nick, reason, channels) {
  channels.forEach(_.partial(removeTimer, channel))
}

client.on('registered', () => {
  if (process.env.NICKSERV_PASSWORD) {
    client.say('nickserv', `identify ${config.url.username} ${process.env.NICKSERV_PASSWORD}`)

    setTimeout(() => {
      // rejoin once id'd
      config.channels.forEach(({ name }) => {
        client.join(name)
      })
    }, 2500)
  }
})

client.on('names', (channel, nicks) => {
  // happens on first join, start times for all of these boys
  debug('names in', channel, ':', nicks)

  _.chain(nicks)
  .omit(client.nick)
  .keys()
  .map(_.partial(resetTimer, channel)).value()
})

client.on('join', resetTimer)
client.on('message#', _.ary(_.flip(resetTimer), 2))
client.on('action', _.ary(_.flip(resetTimer), 2))

client.on('part', removeTimer)
client.on('kick', removeTimer)

client.on('quit', removeMultiChannelTimers)
client.on('kill', removeMultiChannelTimers)

client.on('nick', (oldnick, newnick, channels) => {
  channels.forEach(channel => {
    removeTimer(channel, oldnick)
    resetTimer(channel, newnick)
  })
})

client.on('error', _.partial(debug, 'error'))

client.on('message', (nick, to, text, message) => {
  const target = to === client.nick ? nick : to
  if (text[0] === config.prefix) {
    switch (text.slice(1).split(' ', 2)[0]) {
      case "gtfo-stats":
        throttleNick(nick, () => {
          client.say(target, `${nick}: ${client.nick} is monitoring ${_.values(timers).length} channels and ${_.chain(timers).values().flatten().value().length} nicks. I've kicked ${kickCount} people so far.`)
        })
      case "gtfo-cpu":
        throttleNick(nick, () => {
          client.say(target, `${nick}: Running on ${process.platform} ${process.arch}. Uptime: ${process.uptime()}s. Node Version: ${process.version}. Memory usage: ${process.memoryUsage().rss} bytes.`)
        })
    }
  }
})

const throttles = {}

function throttleNick(nick, cbMaybe) {
  if (throttles[nick]) return
  throttles[nick] = true
  setTimeout(() => {
    delete throttles[nick]
  }, config.throttle)
  cbMaybe()
}

if (going to quit) {
 return false; 
}
