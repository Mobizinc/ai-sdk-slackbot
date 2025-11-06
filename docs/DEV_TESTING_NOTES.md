# DEV Testing Notes - Service Portal Error

**Error:** `org.mozilla.javascript.EvaluatorException: GlideRecord.setTableName - empty table name`

## Alternative Testing Approaches

Since the Service Portal is giving errors, try these alternative access methods:

### 1. Classic UI (Platform View)
Instead of Service Portal (/sp), try accessing via classic UI:
```
https://mobizdev.service-now.com/nav_to.do?uri=sc_cat_item.do?sys_id=142449218381be1468537cdfeeaad39a
```

### 2. Service Catalog URL (not Service Portal)
Try the service catalog URL format:
```
https://mobizdev.service-now.com/com.glideapp.servicecatalog_cat_item_view.do?v=1&sysparm_id=142449218381be1468537cdfeeaad39a
```

### 3. Different Service Portal Page
Try the sc_cat_item page parameter:
```
https://mobizdev.service-now.com/sp?id=sc_cat_item&sys_id=142449218381be1468537cdfeeaad39a&catalog_id=c6743ad047de3d10d9ad2efd046d43be
```

### 4. Test Original Request Support First
Verify if the original works in DEV Service Portal:
```
https://mobizdev.service-now.com/sp?id=sc_cat_item&sys_id=0ad4666883a9261068537cdfeeaad303
```

If the original also fails, the issue is with the DEV environment configuration, not our new catalog items.

## Possible Root Causes

1. **Service Portal Configuration**: DEV might have different Service Portal settings or widgets
2. **Table Access**: The x_mobit_serv_case_service_case table might have restricted ACLs in DEV
3. **Widget Version**: DEV might be using an older/different version of the SC Catalog Item widget
4. **Cache**: Service Portal cache might need to be cleared

## Recommended Next Steps

1. Test if original "Request Support" works in DEV
2. If original works, compare all fields between original and new items more thoroughly
3. If original fails too, check DEV Service Portal configuration
4. Consider testing in PROD instead (with proper backup/rollback plan)
