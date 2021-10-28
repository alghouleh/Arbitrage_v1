const { log, error } = console
const socket = require('socket.io')
const express = require('express')
const cors = require('cors')
const path = require('path')
const BigNumber = require('bignumber.js')

const profit_threshold = 0.12
const initial_amount = 40
let busy = false
const base_asset = 'USDT'

//////// //////// //////// //////// //////// ////////

const binance = require('binance-api-node').default

const APIKEY = ''
const APISECRET = ''

const bnb_client = binance({
  apiKey: '',
  apiSecret: '',
})

let asset_1_pair
let asset_2_pair
let asset_3_pair
let asset_1_asset
let asset_2_asset
let asset_3_asset
let asset_2_qty
let asset_3_qty
let order_status = 0

let minimums = {}

/////////////////////////////////////////////////////////////////////////////////

function roundStep( qty, stepSize ) {
  if ( Number.isInteger( qty ) ) return qty;
  const qtyString = parseFloat( qty ).toFixed( 16 );
  const desiredDecimals = Math.max( stepSize.indexOf( '1' ) - 1, 0 );
  const decimalIndex = qtyString.indexOf( '.' );
  return parseFloat( qtyString.slice( 0, decimalIndex + desiredDecimals + 1 ) );
}

async function listenToAccount() {
  const exchangeinfo = await bnb_client.exchangeInfo()
  //console.log(exchangeinfo.symbols.length)
  for ( let obj of exchangeinfo.symbols ) {
    let filters = {status: obj.status};
    for ( let filter of obj.filters ) {
        if ( filter.filterType == "MIN_NOTIONAL" ) {
            filters.minNotional = filter.minNotional;
        } else if ( filter.filterType == "PRICE_FILTER" ) {
            filters.minPrice = filter.minPrice;
            filters.maxPrice = filter.maxPrice;
            filters.tickSize = filter.tickSize;
        } else if ( filter.filterType == "LOT_SIZE" ) {
            filters.stepSize = filter.stepSize;
            filters.minQty = filter.minQty;
            filters.maxQty = filter.maxQty;
        }
    }
    filters.orderTypes = obj.orderTypes;
    filters.icebergAllowed = obj.icebergAllowed;
    minimums[obj.symbol] = filters;
  }
  //console.log("minimums", minimums['BTCUSDT'])
  const clean = await bnb_client.ws.user( async msg => {
    if (msg.eventType === 'outboundAccountPosition') {
      //console.log(msg)
      if (order_status === 1) {
        order_status = 0
        if (asset_2_pair.substr(asset_2_pair.length - asset_2_asset.length) === asset_2_asset) {
          console.log("LEG 2 BUY asset_2_qty quoteOrderQty", asset_2_asset, asset_2_qty, asset_2_pair)
          await bnb_client.order({
            symbol: asset_2_pair,
            side: 'BUY',
            quoteOrderQty: asset_2_qty,
            type: 'MARKET',
            recvWindow: 15000,
          })
        }
        else {
          console.log("LEG 2 SELL asset_2_qty", asset_2_asset, asset_2_qty, asset_2_pair)
          asset_2_qty = roundStep(asset_2_qty, minimums[asset_2_pair].stepSize)
          console.log("LEG 2 SELL asset_2_qty", asset_2_asset, asset_2_qty, asset_2_pair)
          return await bnb_client.order({
            symbol: asset_2_pair,
            side: 'SELL',
            quantity: asset_2_qty,
            type: 'MARKET',
            recvWindow: 15000,
          })
        }
      }
      else if (order_status === 2) {
        order_status = 0
        if (asset_3_pair.substr(asset_3_pair.length - asset_3_asset.length) === asset_3_asset) {
          //console.log("LEG 3 BUY asset_3_qty quoteOrderQty", asset_3_asset, asset_3_qty, asset_3_pair)
          //asset_3_qty = roundStep(asset_3_qty, minimums[asset_3_pair].stepSize)
          console.log("LEG 3 BUY asset_3_qty quoteOrderQty", asset_3_asset, asset_3_qty, asset_3_pair)
          return await bnb_client.order({
            symbol: asset_3_pair,
            side: 'BUY',
            quoteOrderQty: asset_3_qty,
            type: 'MARKET',
            recvWindow: 15000,
          })
        }
        else {
          console.log("LEG 3 SELL asset_3_qty", asset_3_asset, asset_3_qty, asset_3_pair)
          asset_3_qty = roundStep(asset_3_qty, minimums[asset_3_pair].stepSize)
          console.log("SELL asset_3_qty", asset_3_asset, asset_3_qty, asset_3_pair)
          return await bnb_client.order({
            symbol: asset_3_pair,
            side: 'SELL',
            quantity: asset_3_qty,
            type: 'MARKET',
            recvWindow: 15000,
          })
        }
      }
    }
    ///// /////
    if (msg.eventType === 'executionReport' && msg.orderStatus === 'FILLED' && msg.symbol === asset_1_pair) {
      console.log("executionReport 1", msg)
      asset_1_pair = ''
      if (msg.symbol.substr(msg.symbol.length - asset_2_asset.length) === asset_2_asset) {
        asset_2_qty = msg.totalQuoteTradeQuantity
      }
      else {
        asset_2_qty = msg.quantity
      }
      order_status = 1
      //console.log("LEG 2", msg.symbol, msg.quantity)
    }
    else if (msg.eventType === 'executionReport' && msg.orderStatus === 'FILLED' && msg.symbol === asset_2_pair) {
      console.log("executionReport 2", msg)
      asset_2_pair = ''
      if (msg.symbol.substr(msg.symbol.length - asset_3_asset.length) === asset_3_asset) {
        asset_3_qty = msg.totalQuoteTradeQuantity
      }
      else {
        asset_3_qty = msg.quantity
      }
      order_status = 2
      //console.log("LEG 3", msg.symbol, msg.quantity)
    }
    else if (msg.eventType === 'executionReport' && msg.orderStatus === 'FILLED' && msg.symbol === asset_3_pair) {
      console.log("executionReport 3", msg)
      asset_3_pair = ''
      order_status = 0
      console.log("END.", msg.symbol, msg.quantity)
      busy = false
      process.exit()
    }
    
  })
  console.log("==================================================================")
}

listenToAccount()

//////// //////// //////// //////// //////// ////////

const app = express()
const server = app.listen(3000, () =>
  log('Arbitrage Bot has just started on port 3000. Please wait.....')
)

app.use(cors())
app.use('/JS', express.static(path.join(__dirname, './Pages/JS')))
app.get('/', (_, res) => {
  res.sendFile(path.join(__dirname, './Pages/index.html'))
})

const io = socket(server)

const arbitrage = require('./arbitrage')

const initialize = async () => {
  await arbitrage.getPairs()
  arbitrage.wsconnect()
}

arbitrage.eventEmitter.on('ARBITRAGE', async (pl) => {
  if ( pl[0].value > 0.1 ) console.log(pl[0].value, pl[0].tpath)
  if ( pl[0].value >= profit_threshold && !busy && pl[0].d1===base_asset ) {
    console.log("====>", pl[0])
    busy = true
    await processFirstOrder(pl[0])
    //busy = false
  }
  io.sockets.emit('ARBITRAGE', pl)
})

async function processFirstOrder(data) {
  //console.log('processFirstOrder', data.d1, data.d2, data.d3, data.value, data.lv1, data.lv2, data.lv3)
  asset_1_pair = data.lv1
  asset_2_pair = data.lv2
  asset_3_pair = data.lv3
  asset_1_asset = data.d1
  asset_2_asset = data.d2
  asset_3_asset = data.d3
  if (asset_1_pair.substr(asset_1_pair.length - asset_1_asset.length) === asset_1_asset) {
    console.log("LEG 1 BUY asset_1_qty quoteOrderQty", asset_1_asset, initial_amount, asset_1_pair)
    return await bnb_client.order({
      symbol: asset_1_pair,
      side: 'BUY',
      quoteOrderQty: initial_amount,
      type: 'MARKET',
      recvWindow: 15000,
    })
  }
  else {
    console.log("LEG 1 SELL asset_1_qty", asset_1_asset, initial_amount, asset_1_pair)
    return await bnb_client.order({
      symbol: asset_1_pair,
      side: 'SELL',
      quantity: initial_amount,
      type: 'MARKET',
      recvWindow: 15000,
    })
  }
}

initialize()
