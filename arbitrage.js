const { log, error } = console
const got = require('got')
const events = require('events')
const Websocket = require('ws')
const { sort } = require('fast-sort')

let pairs = [],
  symValJ = {}

const base_asset = 'BUSD'

const banned_currency = ["GBP", "RUB", "AUD", "CHF", "CZK", "DKK", "NOK", "NZD", "PLN", "SEK", "TRY", "ZAR", "HUF", "ILS", "AED", "BGN", "BRL", "CAD", "EUR", "INR", "MXN", "MYR", "NGN", "RON", "TWD", "UAH", "MAD"]

const eventEmitter = new events()

const getPairs = async () => {
  console.log("getPairs...")
  const resp = await got('https://api.binance.com/api/v3/exchangeInfo');
  const eInfo = JSON.parse(resp.body);
  const symbols = [
    ...new Set(
      eInfo.symbols
        .filter((d) => d.status === 'TRADING')
        .filter((d) => !banned_currency.includes(d.quoteAsset))
        .filter((d) => !banned_currency.includes(d.baseAsset))
        .map((d) => [d.baseAsset, d.quoteAsset])
        .flat()
    ),
  ]
  const validPairs = eInfo.symbols
    .filter((d) => d.status === 'TRADING')
    .map((d) => {
      return d.symbol
    })
  validPairs.forEach((symbol) => {
    symValJ[symbol] = { bidPrice: 0, askPrice: 0 ,bidQuantity: 0,askQuantity: 0,totalTrade: 0,eventTime:0}  
  })
  console.log(validPairs)

  let s1 = symbols,
    s2 = symbols,
    s3 = symbols

  s1.forEach( (d1) => {
    if (d1===base_asset) {
      s2.forEach( (d2) => {
        s3.forEach( (d3) => {
          if (!(d1 == d2 || d2 == d3 || d3 == d1)) {
            let lv1 = [],
              lv2 = [],
              lv3 = [],
              l1 = '',
              l2 = '',
              l3 = ''
            if (symValJ[d1 + d2]) {
              lv1.push(d1 + d2);
              l1 = 'num'
            }
            if (symValJ[d2 + d1]) {
              lv1.push(d2 + d1);
              l1 = 'den'
            }
            if (symValJ[d2 + d3]) {
              lv2.push(d2 + d3);
              l2 = 'num'
            }
            if (symValJ[d3 + d2]) {
              lv2.push(d3 + d2);
              l2 = 'den'
            }
            if (symValJ[d3 + d1]) {
              lv3.push(d3 + d1);
              l3 = 'num'
            }
            if (symValJ[d1 + d3]) {
              lv3.push(d1 + d3);
              l3 = 'den'
            }
            if (lv1.length && lv2.length && lv3.length) {
              pairs.push({
                l1: l1,
                l2: l2,
                l3: l3,
                d1: d1,
                d2: d2,
                d3: d3,
                lv1: lv1[0],
                lv2: lv2[0],
                lv3: lv3[0],
                value: -100,
                timen: Date.now(),
                QTotal: 0,
                QPrice1: 0,
                QPrice2: 0,
                QPrice3: 0,
                tpath: '',
              })
            }
          }
        })
      })
    }
  })
  log(`Finished identifying Arbitrage Paths. Total paths = ${pairs.length}`)
}

const processData = (data) => {
  if (JSON.parse(data).length) {
    //console.log("processData", JSON.parse(data).length)
    try {
      data = JSON.parse(data);
      if (data['result'] === null) return
      //Update JSON
      data.forEach((d) => {
        symValJ[d.s].askPrice = d.a * 1
        symValJ[d.s].bidPrice = d.b * 1
        symValJ[d.s].bidQuantity = d.B * 1
        symValJ[d.s].askQuantity = d.A * 1
        symValJ[d.s].totalTrade = d.q * 1
        symValJ[d.s].eventTime = d.E * 1
      })
      //Perform calculation and send alerts
      pairs.forEach((d) => {
        //continue if price is not updated for any symbol
        if (
          symValJ[d.lv1]['bidPrice'] &&
          symValJ[d.lv2]['bidPrice'] &&
          symValJ[d.lv3]['bidPrice']
        ) {
          //Level 1 calculation
          let lv_calc, lv_str,QPrice1,QPrice2,QPrice3;
          if (d.l1 === 'num') {
            lv_calc = symValJ[d.lv1]['bidPrice']
            QPrice1=symValJ[d.lv1]['bidQuantity']
            lv_str =
              d.d1 +
              '->' +
              d.lv1 +
              "['bidP']['" +
              symValJ[d.lv1]['bidPrice'] +
              "']" +
              '->' +
              d.d2 +
              '->' +
              "['bidQ']"+
              symValJ[d.lv1]['bidQuantity'] +
              "['totalT']"+
              symValJ[d.lv1]['totalTrade']+
              '->'+
              '<br/>'
          } else {
            lv_calc = 1 / symValJ[d.lv1]['askPrice']
            QPrice1=symValJ[d.lv1]['askPrice']*symValJ[d.lv1]['askQuantity']
            lv_str =
              d.d1 +
              '->' +
              d.lv1 +
              "['askP']['" +
              symValJ[d.lv1]['askPrice'] +
              "']" +
              '->' +
              d.d2 +
              "['askQ']"+
              symValJ[d.lv1]['askQuantity'] +
              "['totalT']"+
              symValJ[d.lv1]['totalTrade']+
              '->'+
              '<br/>'
          }
  
          //Level 2 calculation
          if (d.l2 === 'num') {
            lv_calc *= symValJ[d.lv2]['bidPrice']
            //calculate quantity price 
            if (d.l1 === 'num') {
              QPrice2=(symValJ[d.lv2]['bidPrice']*symValJ[d.lv1]['bidPrice'])*symValJ[d.lv2]['bidQuantity'];
            }else 
            {//done
              QPrice2=symValJ[d.lv1]['askPrice']*symValJ[d.lv2]['bidQuantity'];
            }
            //
            lv_str +=
              d.d2 +
              '->' +
              d.lv2 +
              "['bidP']['" +
              symValJ[d.lv2]['bidPrice'] +
              "']" +
              '->' +
              d.d3 +
              "['bidQ']"+
              symValJ[d.lv2]['bidQuantity'] +
              "['totalT']"+
              symValJ[d.lv2]['totalTrade']+
              "['Qprice']"+
              QPrice2+
              '->'+
              '<br/>'
              
          } else {
            lv_calc *= 1 / symValJ[d.lv2]['askPrice']
             //calculate quantity price 
             if (d.l1 === 'num') {
              QPrice2=(symValJ[d.lv2]['askPrice']/symValJ[d.lv1]['bidPrice'])*symValJ[d.lv2]['askQuantity'];
            }else 
            {//done
              QPrice2=(symValJ[d.lv2]['askPrice']*symValJ[d.lv1]['askPrice'])*symValJ[d.lv2]['askQuantity'];
            }
            //
            lv_str +=
              d.d2 +
              '->' +
              d.lv2 +
              "['askP']['" +
              symValJ[d.lv2]['askPrice'] +
              "']" +
              '->' +
              d.d3 +
              "['askQ']"+
              symValJ[d.lv2]['askQuantity'] +
              "['totalT']"+
              symValJ[d.lv2]['totalTrade']+
              "['Qprice']"+
              QPrice2+
              '->'+
              '<br/>'
              
          }
  
          //Level 3 calculation
          if (d.l3 === 'num') {
            lv_calc *= symValJ[d.lv3]['bidPrice']
             QPrice3=symValJ[d.lv3]['bidPrice']*symValJ[d.lv3]['bidQuantity'];
             lv_str +=
              d.d3 +
              '->' +
              d.lv3 +
              "['bidP']['" +
              symValJ[d.lv3]['bidPrice'] +
              "']" +
              '->' +
              d.d1+
              "['bidQ']"+
              symValJ[d.lv3]['bidQuantity'] +
              "['totalT']"+
              symValJ[d.lv3]['totalTrade']+
              "['Qprice']"+
              QPrice3+
              '->'
              
          } else {
            lv_calc *= 1 / symValJ[d.lv3]['askPrice']
            // done
            QPrice3=symValJ[d.lv3]['askPrice']*symValJ[d.lv3]['askQuantity'];
            //
            lv_str +=
              d.d3 +
              '->' +
              d.lv3 +
              "['askP']['" +
              symValJ[d.lv3]['askPrice'] +
              "']" +
              '->' +
              d.d1 +
              "['askQ']"+
              symValJ[d.lv3]['askQuantity'] +
              "['totalT']"+
              symValJ[d.lv3]['totalTrade']+
              "['Qprice']"+
              QPrice3+
              '->'
              
          }
          d.QPrice1 =QPrice1;
          d.QPrice2 =QPrice2;
          d.QPrice3 =QPrice3;
          d.tpath = lv_str
          d.value = parseFloat(parseFloat((lv_calc - 1) * 100).toFixed(3))
          d.timen=symValJ[d.lv1].eventTime;
          
        }
      });
  
      //Send Socket
      eventEmitter.emit(
        'ARBITRAGE',
        sort(pairs.filter((d) => d.value > 0 && d.QPrice1>10000 && d.QPrice2>15000 && d.QPrice3>15000)).desc((u) => u.value)
      );
    } catch (err) {
      error(err)
    }
  }
}

let ws = ''
const wsconnect = () => {
  console.log("WS CONNECT")
  ws = new Websocket(`wss://stream.binance.com:9443/ws`); //!ticker@arr
  ws.on('open', () => {
    console.log("WS STREAM OPEN")
    ws.send(
      JSON.stringify({
        method: 'SUBSCRIBE',
        params: ['!ticker@arr'],
        id: 121212131,
      })
    )
  })
  ws.on('error', log)
  ws.on('message', processData)
}

module.exports = { getPairs, wsconnect, eventEmitter };
