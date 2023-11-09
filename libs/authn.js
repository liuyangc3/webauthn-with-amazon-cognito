/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file.
 * This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

const express = require('express');
const router = express.Router();
const { Fido2Lib } = require('fido2-lib');
const base64 = require('@hexagon/base64');
// const { coerceToBase64Url, coerceToArrayBuffer } = require('fido2-lib/lib/utils');

router.use(express.json());

const f2l = new Fido2Lib({
  timeout: 30 * 1000 * 60,
  //rpId: process.env.HOSTNAME,
  rpName: "WebAuthn With Cognito",
  challengeSize: 32,
  cryptoParams: [-7]
});


/**
 * Respond with required information to call navigator.credential.create()
 * Response format:
 * {
     rp: {
       id: String,
       name: String
     },
     user: {
       displayName: String,
       id: String,
       name: String
     },
     publicKeyCredParams: [{  
       type: 'public-key', alg: -7
     }],
     timeout: Number,
     challenge: String,
     allowCredentials : [{
       id: String,
       type: 'public-key',
       transports: [('ble'|'nfc'|'usb'|'internal'), ...]
     }, ...],
     authenticatorSelection: {
       authenticatorAttachment: ('platform'|'cross-platform'),
       requireResidentKey: Boolean,
       userVerification: ('required'|'preferred'|'discouraged')
     },
     attestation: ('none'|'indirect'|'direct')
 * }
 **/
router.post('/createCredRequest', async (req, res) => {
  f2l.config.rpId = `${req.get('host')}`;

    const response = await f2l.attestationOptions();
    console.log(`response1: `, response);

    response.user = {
      displayName: req.body.name,
      id: req.body.username,
      name: req.body.username
    };
    response.challenge = coerceToBase64Url(response.challenge, 'challenge');
    response.excludeCredentials = [];
    response.pubKeyCredParams = [];
    // const params = [-7, -35, -36, -257, -258, -259, -37, -38, -39, -8];
    const params = [-7, -257];
    for (let param of params) {
      response.pubKeyCredParams.push({ type: 'public-key', alg: param });
    }
    const as = {}; // authenticatorSelection
    const aa = req.body.authenticatorSelection.authenticatorAttachment;
    const rr = req.body.authenticatorSelection.requireResidentKey;
    const uv = req.body.authenticatorSelection.userVerification;
    const cp = req.body.attestation; // attestationConveyancePreference
    let asFlag = false;

    if (aa && (aa == 'platform' || aa == 'cross-platform')) {
      asFlag = true;
      as.authenticatorAttachment = aa;
    }
    if (rr && typeof rr == 'boolean') {
      asFlag = true;
      as.requireResidentKey = rr;
    }
    if (uv && (uv == 'required' || uv == 'preferred' || uv == 'discouraged')) {
      asFlag = true;
      as.userVerification = uv;
    }
    if (asFlag) {
      response.authenticatorSelection = as;
    }
    if (cp && (cp == 'none' || cp == 'indirect' || cp == 'direct')) {
      response.attestation = cp;
    }

    console.log(`response2: `, response);

    res.json(response);
});


/**
 * Register user credential.
 * Input format:
 * {
     id: String,
     type: 'public-key',
     rawId: String,
     response: {
       clientDataJSON: String,
       attestationObject: String,
       signature: String,
       userHandle: String
     }
 * }
 **/
router.post('/parseCredResponse', async (req, res) => {
  f2l.config.rpId = `${req.get('host')}`;

  try {
    const clientAttestationResponse = { response: {} };
    clientAttestationResponse.rawId = coerceToArrayBuffer(req.body.rawId, "rawId");
    clientAttestationResponse.response.clientDataJSON = coerceToArrayBuffer(req.body.response.clientDataJSON, "clientDataJSON");
    clientAttestationResponse.response.attestationObject = coerceToArrayBuffer(req.body.response.attestationObject, "attestationObject");

    let origin = `https://${req.get('host')}`;

    const attestationExpectations = {
      challenge: req.body.challenge,
      origin: origin,
      factor: "either"
    };

    const regResult = await f2l.attestationResult(clientAttestationResponse, attestationExpectations);

    const credential = {
      credId: coerceToBase64Url(regResult.authnrData.get("credId"), 'credId'),
      publicKey: regResult.authnrData.get("credentialPublicKeyPem"),
      aaguid: coerceToBase64Url(regResult.authnrData.get("aaguid"), 'aaguid'),
      prevCounter: regResult.authnrData.get("counter"),
      flags: regResult.authnrData.get("flags")
    };

    // Respond with user info
    res.json(credential);
  } catch (e) {
    res.status(400).send({ error: e.message });
  }
});


function coerceToArrayBuffer(buf, name) {
	if (!name) {
		throw new TypeError("name not specified in coerceToArrayBuffer");
	}

	// Handle empty strings
	if (typeof buf === "string" && buf === "") {
		buf = new Uint8Array(0);

		// Handle base64url and base64 strings
	} else if (typeof buf === "string") {
		// base64 to base64url
		buf = buf.replace(/\+/g, "-").replace(/\//g, "_").replace("=", "");
		// base64 to Buffer
		buf = base64.toArrayBuffer(buf, true);
	}

	// Extract typed array from Array
	if (Array.isArray(buf)) {
		buf = new Uint8Array(buf);
	}

	// Extract ArrayBuffer from Node buffer
	if (typeof Buffer !== "undefined" && buf instanceof Buffer) {
		buf = new Uint8Array(buf);
		buf = buf.buffer;
	}

	// Extract arraybuffer from TypedArray
	if (buf instanceof Uint8Array) {
		buf = buf.slice(0, buf.byteLength, buf.buffer.byteOffset).buffer;
	}

	// error if none of the above worked
	if (!(buf instanceof ArrayBuffer)) {
		throw new TypeError(`could not coerce '${name}' to ArrayBuffer`);
	}

	return buf;
}

function coerceToBase64Url(thing, name) {
	if (!name) {
		throw new TypeError("name not specified in coerceToBase64");
	}

	if (typeof thing === "string") {
		// Convert from base64 to base64url
		thing = thing.replace(/\+/g, "-").replace(/\//g, "_").replace(/={0,2}$/g, "");
	}

	if (typeof thing !== "string") {
		try {
			thing = base64.fromArrayBuffer(
				coerceToArrayBuffer(thing, name),
				true,
			);
		} catch (_err) {
			throw new Error(`could not coerce '${name}' to string`);
		}
	}

	return thing;
}

module.exports = router;
