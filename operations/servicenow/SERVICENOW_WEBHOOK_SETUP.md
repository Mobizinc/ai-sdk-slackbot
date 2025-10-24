# ServiceNow Webhook Integration Setup

## Configuration for ServiceNow Team

### 1. Webhook Endpoint
```
POST https://your-domain.vercel.app/api/servicenow-webhook
```
*(Replace `your-domain.vercel.app` with actual domain)*

### 2. Webhook Secret
```
1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758
```
**⚠️ IMPORTANT**: Store this securely in ServiceNow System Properties.

### 3. HTTP Headers
```
Content-Type: application/json
x-servicenow-signature: <generated-signature>
```

### 4. Signature Generation

Both **hex** and **base64** formats are accepted.

#### Base64 (Recommended):
```javascript
var mac = new GlideMac();
mac.setAlgorithm('HmacSHA256');
mac.setKey(secret);
var signature = mac.generateBase64Mac(payload);
```

#### Hex:
```javascript
var mac = new GlideMac();
mac.setAlgorithm('HmacSHA256');
mac.setKey(secret);
var signature = mac.generateMac(payload);
```

### 5. Complete Business Rule Example

```javascript
(function executeRule(current, previous) {

    // Get webhook secret from System Properties
    var secret = gs.getProperty('x_webhook.case_classification_secret');

    // Build JSON payload
    var payload = JSON.stringify({
        case_number: current.number.toString(),
        sys_id: current.sys_id.toString(),
        short_description: current.short_description.toString(),
        description: current.description ? current.description.toString() : '',
        priority: current.priority.toString(),
        urgency: current.urgency.toString(),
        state: current.state.toString(),
        company: current.company ? current.company.toString() : ''
    });

    // Generate signature (base64)
    var mac = new GlideMac();
    mac.setAlgorithm('HmacSHA256');
    mac.setKey(secret);
    var signature = mac.generateBase64Mac(payload);

    // Send webhook
    try {
        var request = new sn_ws.RESTMessageV2();
        request.setHttpMethod('POST');
        request.setEndpoint('https://your-domain.vercel.app/api/servicenow-webhook');
        request.setRequestHeader('Content-Type', 'application/json');
        request.setRequestHeader('x-servicenow-signature', signature);
        request.setRequestBody(payload);

        var response = request.execute();
        var statusCode = response.getStatusCode();

        if (statusCode == 200) {
            gs.info('Case classification webhook sent for ' + current.number);
        } else {
            gs.error('Webhook failed for ' + current.number + ' - Status: ' + statusCode);
        }
    } catch (ex) {
        gs.error('Webhook exception: ' + ex.getMessage());
    }

})(current, previous);
```

### 6. System Property Setup

Create system property to store the secret:

1. Navigate to: **System Properties** → **New**
2. **Name**: `x_webhook.case_classification_secret`
3. **Value**: `1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758`
4. **Type**: String (encrypted recommended)

---

## Quick Summary for ServiceNow Team

**What they need:**

1. **Webhook URL**: `https://your-domain.vercel.app/api/servicenow-webhook`
2. **Secret**: `1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758`
3. **Signature Header**: `x-servicenow-signature`
4. **Signature Format**: HMAC-SHA256 (hex or base64)
5. **Required Fields**: `case_number`, `sys_id`, `short_description`

**What they do:**

1. Create System Property with the secret
2. Create Business Rule (After Insert on Case table)
3. Generate HMAC signature using GlideMac
4. Send POST request with signature header
5. Handle response (200 = success)
