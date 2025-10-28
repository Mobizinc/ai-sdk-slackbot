# ServiceNow Webhook Setup (Simple API Key - Like Azure Functions)

## For ServiceNow Team

### 1. Webhook Endpoint
```
POST https://your-domain.vercel.app/api/servicenow-webhook
```

### 2. API Key
```
1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758
```

### 3. Authentication (Pick ONE - All 3 Work!)

#### Option A: Header (Recommended)
```javascript
request.setRequestHeader('x-api-key', '1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758');
```

#### Option B: Query Parameter (Azure Functions style)
```javascript
request.setEndpoint('https://your-domain.vercel.app/api/servicenow-webhook?code=1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758');
```

#### Option C: HMAC Signature (Advanced - if you really want to)
```javascript
var mac = new GlideMac();
mac.setAlgorithm('HmacSHA256');
mac.setKey('1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758');
var signature = mac.generateBase64Mac(payload);
request.setRequestHeader('x-servicenow-signature', signature);
```

---

## Complete ServiceNow Business Rule (Copy-Paste Ready)

```javascript
(function executeRule(current, previous) {

    // Simple API key - no signature generation needed!
    var apiKey = '1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758';

    // Build JSON payload
    var payload = JSON.stringify({
        case_number: current.number.toString(),
        sys_id: current.sys_id.toString(),
        short_description: current.short_description.toString(),
        description: current.description ? current.description.toString() : '',
        priority: current.priority ? current.priority.toString() : '',
        urgency: current.urgency ? current.urgency.toString() : '',
        impact: current.impact ? current.impact.toString() : '',
        category: current.category ? current.category.toString() : '',
        state: current.state ? current.state.toString() : '',
        assignment_group: current.assignment_group ? current.assignment_group.name.toString() : '',
        company: current.company ? current.company.toString() : '',
        account_id: current.account ? current.account.toString() : ''
    });

    // Send webhook with simple API key (like Azure Functions!)
    try {
        var request = new sn_ws.RESTMessageV2();
        request.setHttpMethod('POST');
        request.setEndpoint('https://your-domain.vercel.app/api/servicenow-webhook');
        request.setRequestHeader('Content-Type', 'application/json');
        request.setRequestHeader('x-api-key', apiKey); // Simple API key!
        request.setRequestBody(payload);

        var response = request.execute();
        var statusCode = response.getStatusCode();

        if (statusCode == 200) {
            gs.info('✅ Case classification webhook sent for ' + current.number);
        } else {
            gs.error('❌ Webhook failed for ' + current.number + ' - Status: ' + statusCode);
            gs.error('Response: ' + response.getBody());
        }
    } catch (ex) {
        gs.error('❌ Webhook exception: ' + ex.getMessage());
    }

})(current, previous);
```

---

## That's It!

**No complex signature generation required!**

Just send the API key in the `x-api-key` header - exactly like your old Azure Function App setup.

### Differences from Azure Functions:
- ✅ Same simplicity - just send API key
- ✅ Header name: `x-api-key` (instead of `x-functions-key`)
- ✅ Or use query param: `?code=xxx` (same as Azure Functions!)
- ✅ Or use HMAC signature if you prefer (but why make it complicated?)

### Required Fields:
- `case_number` (required)
- `sys_id` (required)
- `short_description` (required)
- All other fields optional (send empty strings if not available)

### Expected Response (200 OK):
```json
{
  "success": true,
  "case_number": "SCS0048189",
  "classification": {
    "category": "User Access Management",
    "subcategory": "Password Reset",
    "confidence_score": 0.95
  }
}
```

### Error Responses:
- `401 Unauthorized`: Wrong API key
- `422 Unprocessable Entity`: Missing required fields
- `500 Internal Server Error`: Server error

---

## Environment Variable (For Your Team)

Set this in Vercel/Azure:
```bash
SERVICENOW_WEBHOOK_SECRET=1ecbd5b55928136d040bf39a01d985472db697f8279d79d365d00e30c4fcd758
```

This same value works for all 3 authentication methods!

---

**Contact**: [Your contact info]
