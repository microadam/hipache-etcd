var async = require('async')
  , Etcd = require('node-etcd')
  , etcdLocation = process.env.ETCD_LOCATION || '127.0.0.1:4001'
  , etcdHost = etcdLocation.split(':')[0]
  , etcdPort = etcdLocation.split(':')[1]
  , etcd = new Etcd(etcdHost, etcdPort)

  , redisLocation = process.env.REDIS_LOCATION || '127.0.0.1:6379'
  , redisHost = redisLocation.split(':')[0]
  , redisPort = redisLocation.split(':')[1]
  , redis = require('redis')
  , client = redis.createClient(redisPort, redisHost)

client.on('error', function (error) {
  console.log('REDIS ERROR:' + error)
})

client.on('ready', function () {
  console.log('Client connected to:', this.host, this.port)
  run()
})

client.on('end', function () {
  console.log('Client disconnected to:', this.host, this.port)
})

// etcd.del('hipache', { recursive: true })

function getDomains(callback) {
  etcd.get('hipache', { recursive: true }, function (error, result) {
    if (error && error.message === 'Key not found') {
      error = null
    }
    var domains = []
    if (result && result.node && result.node.nodes) {
      result.node.nodes.forEach(function (node) {
        var domain =
          { name: node.key.split('/')[2]
          , hosts: []
          }
        if (node.nodes) {
          node.nodes.forEach(function (node) {
            domain.hosts.push(node.value)
          })
        }
        domains.push(domain)
      })
    }
    callback(error, domains)
  })
}

function updateHipache(domains, callback) {
  async.each
  ( domains
  , function (domain, eachCallback) {
      var key = 'frontend:' + domain.name
        , tasks =
          [ function (seriesCallback) {
              client.del(key, seriesCallback)
            }
          , function (seriesCallback) {
              client.rpush(key, domain.name, seriesCallback)
            }
          ]

      domain.hosts.forEach(function (host) {
        var task = function (seriesCallback) {
          client.rpush(key, host, seriesCallback)
        }
        tasks.push(task)
      })

      async.series
      ( tasks
      , function (error) {
          client.lrange(key, 0, -1, function (err, reply) {
            console.log(111, reply)
            eachCallback(error)
          })
        }
      )
    }
  , callback
  )
}

function run() {
  async.waterfall
  (
    [ getDomains
    , updateHipache
    ]
  , function (error) {
      if (error) {
        console.log(error)
        throw error
      }
    }
  )
}

var watcher = etcd.watcher('hipache', null, { recursive: true })
watcher.on('change', run)
watcher.on('error', function (error) {
  console.log('ETCD ERROR: ' + error)
})