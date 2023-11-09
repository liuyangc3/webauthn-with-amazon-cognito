// init project
const AmazonCognitoIdentity = require('amazon-cognito-identity-js');
require('dotenv');
const express = require('express');
const cookieParser = require('cookie-parser');
const hbs = require('hbs');
const authn = require('./libs/authn');
const helmet = require('helmet');
const uuid = require('uuid');
const app = express();

// app.use(helmet());
app.use((req, res, next) => {
  const nonce = uuid.v4();
  res.locals.nonce = nonce;

  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'","https://cognito-idp.ap-southeast-1.amazonaws.com"],
      scriptSrc: ["'self'", "https://ajax.googleapis.com","https://cdn.jsdelivr.net","'unsafe-inline'",`'nonce-${nonce}'`,"https://cognito-idp.ap-southeast-1.amazonaws.com"], // 例如你设置了 script-src
      // 如果你想解决警告，可以明确设置 script-src-elem
      scriptSrcElem: ["'self'", "https://ajax.googleapis.com","https://cdn.jsdelivr.net","https://cognito-idp.ap-southeast-1.amazonaws.com"],
      imgSrc: ["'self'", "data:", "https://ajax.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      // ... 其他指令
    },
  })(req, res, next);
});



app.set('view engine', 'html');
app.engine('html', hbs.__express);
app.set('views', './views');
app.use(cookieParser());
app.use(express.json());
app.use(express.static('public'));

app.use((req, res, next) => {
  if (req.get('x-forwarded-proto') &&
     (req.get('x-forwarded-proto')).split(',')[0] !== 'https') {
    return res.redirect(301, `https://${req.get('host')}`);
  }
  req.schema = 'https';
  next();
});

// http://expressjs.com/en/starter/basic-routing.html
app.get('/', (req, res) => {
  res.render('webauthn.html');
});

app.get('/webauthn', (req, res) => {
  res.render('webauthn.html');
});

app.use('/authn', authn);

// listen for req :)
const port = 8080;
const listener = app.listen(port, () => {
  console.log('Your app is listening on port ' + listener.address().port);
});
