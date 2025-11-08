# Standard Changes Extraction

## Extraction Details

- **Extracted At**: 2025-11-07T17:47:36.858Z
- **Instance**: https://mobiz.service-now.com
- **Query**: `short_description=Standard Change for ServiceNow Platform Updates^ORDERBYDESCsys_created_on`
- **Total Changes**: 100

## File Structure

```
2025-11-07/
├── index.json                    # Manifest listing all changes with metadata
├── changes/                      # Individual change files (one per record)
│   ├── CHG0001234.json
│   ├── CHG0001235.json
│   └── ...
├── change_requests.json          # Bulk export - all change records
├── state_transitions.json        # Bulk export - state history
├── component_references.json     # Bulk export - CI relationships
├── related_records.json          # Bulk export - work notes/comments
└── README.md                     # This file
```

## Files

1. **index.json** - Manifest listing all individual change files with summary metadata
2. **changes/** - Directory containing individual JSON files (one per change record)
   - Each file named by change number (e.g., `CHG0001234.json`)
   - Contains complete change data including state transitions, components, and related records
3. **change_requests.json** - Bulk export of all change request records
4. **state_transitions.json** - Bulk export of state history for all changes
5. **component_references.json** - Bulk export of Configuration Item relationships
6. **related_records.json** - Bulk export of work notes, comments, and attachments

## Working with Individual Change Files

### Load a Specific Change

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load a specific change by number
const changeData = JSON.parse(
  fs.readFileSync('changes/CHG0001234.json', 'utf-8')
);

console.log(`Change: ${changeData.metadata.change_number}`);
console.log(`State Transitions: ${changeData.state_transitions.length}`);
console.log(`Components: ${changeData.component_references.length}`);
```

### Load Index and Process All Changes

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load the index manifest
const index = JSON.parse(fs.readFileSync('index.json', 'utf-8'));

console.log(`Total changes: ${index.metadata.total_changes}`);

// Process each change
for (const changeRef of index.changes) {
  console.log(`Loading ${changeRef.number} from ${changeRef.file_path}`);

  const changeData = JSON.parse(
    fs.readFileSync(changeRef.file_path, 'utf-8')
  );

  // Your processing logic here
  // 1. Create/update change request
  // 2. Restore state transitions
  // 3. Link component references
  // 4. Add work notes/comments
}
```

## Offline Replay

To replay individual changes:

```typescript
import * as fs from 'node:fs';

// Load specific change
const change = JSON.parse(fs.readFileSync('changes/CHG0001234.json', 'utf-8'));

// Extract data
const changeRequest = change.change_request;
const stateTransitions = change.state_transitions;
const componentRefs = change.component_references;
const relatedRecords = change.related_records;

// Replay logic
console.log(`Replaying ${change.metadata.change_number}`);
// POST to target ServiceNow instance
```

## ServiceNow API Reference

- **Table API**: `/api/now/table/{table_name}`
- **Change Request Table**: `change_request`
- **State Transitions**: Tracked in `change_task` and `sys_audit`
- **Component Links**: `task_ci` table
- **Work Notes/Comments**: `sys_journal_field` table
- **Attachments**: `sys_attachment` table

## Change Details

### CHG0042104
- **sys_id**: `7e2d1c06c34d325066d9bdb4e4013114`
- **State**: Closed
- **Created**: 2025-11-07 09:21:22
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0042100
- **sys_id**: `a42f3929c385fe90ad36b9ff050131f4`
- **State**: New
- **Created**: 2025-11-06 03:45:29
- **State Transitions**: 0
- **Component References**: 1
- **Related Records**: 0

### CHG0041987
- **sys_id**: `b8b11c0dc3893a1066d9bdb4e40131f6`
- **State**: Closed
- **Created**: 2025-11-04 05:57:27
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041986
- **sys_id**: `f981b433c3347290ad36b9ff050131a9`
- **State**: Closed
- **Created**: 2025-10-31 12:02:39
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041985
- **sys_id**: `44da76a3c3343290ad36b9ff050131d3`
- **State**: Closed
- **Created**: 2025-10-31 03:24:32
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041980
- **sys_id**: `20f3ab0947f07a1085733525d36d4385`
- **State**: Closed
- **Created**: 2025-10-23 12:00:58
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041978
- **sys_id**: `bbf615f883f4f210ba267000feaad37a`
- **State**: Closed
- **Created**: 2025-10-22 07:06:30
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 2

### CHG0041960
- **sys_id**: `1482fec7c3ecb21066d9bdb4e401314f`
- **State**: New
- **Created**: 2025-10-17 03:42:52
- **State Transitions**: 0
- **Component References**: 1
- **Related Records**: 1

### CHG0041959
- **sys_id**: `9ef327a6c32cf21066d9bdb4e40131d9`
- **State**: Closed
- **Created**: 2025-10-15 17:34:33
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041958
- **sys_id**: `2cd1bff0c368b21066d9bdb4e40131cb`
- **State**: Closed
- **Created**: 2025-10-10 08:08:21
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041956
- **sys_id**: `7c583de4c3ec3210ad36b9ff050131a0`
- **State**: Closed
- **Created**: 2025-10-09 04:36:49
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041948
- **sys_id**: `9fea9531c3dc3210ad36b9ff0501315a`
- **State**: Closed
- **Created**: 2025-09-30 13:26:37
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041946
- **sys_id**: `bd2da72cc3983210ad36b9ff05013160`
- **State**: Closed
- **Created**: 2025-09-27 02:53:14
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041945
- **sys_id**: `40060460c3187210ad36b9ff05013156`
- **State**: Closed
- **Created**: 2025-09-26 10:01:38
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041939
- **sys_id**: `5e0774bfc3c83210ad36b9ff0501311b`
- **State**: Closed
- **Created**: 2025-09-24 05:41:31
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041938
- **sys_id**: `6170456fc3887210ad36b9ff050131f5`
- **State**: Closed
- **Created**: 2025-09-23 11:43:43
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041926
- **sys_id**: `8e8e3e06c3c47e1066d9bdb4e401319a`
- **State**: Closed
- **Created**: 2025-09-19 05:05:27
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041925
- **sys_id**: `208492cac3807e1066d9bdb4e401319d`
- **State**: Closed
- **Created**: 2025-09-19 02:01:03
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041921
- **sys_id**: `a6e73bc9c300f61066d9bdb4e40131fb`
- **State**: Closed
- **Created**: 2025-09-16 06:39:38
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041920
- **sys_id**: `5c17838dc388b61066d9bdb4e40131ee`
- **State**: Closed
- **Created**: 2025-09-16 03:06:25
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041919
- **sys_id**: `35408afbc3fb6a905bcb9df015013164`
- **State**: Closed
- **Created**: 2025-09-12 00:46:33
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041918
- **sys_id**: `9106cd1bc33f66905bcb9df01501312d`
- **State**: Closed
- **Created**: 2025-09-10 07:13:42
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041917
- **sys_id**: `6078c0dbc33766905bcb9df0150131a7`
- **State**: Closed
- **Created**: 2025-09-10 02:43:41
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041900
- **sys_id**: `b365c2d9c3b3e6505bcb9df01501312e`
- **State**: Closed
- **Created**: 2025-09-04 06:42:32
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041855
- **sys_id**: `ae808691c3b3e6505bcb9df01501312c`
- **State**: Closed
- **Created**: 2025-09-04 06:20:41
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041835
- **sys_id**: `664fb5ddc373e6505bcb9df0150131cc`
- **State**: Closed
- **Created**: 2025-09-04 06:15:12
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041803
- **sys_id**: `f8732154c33baa10a01d5673e4013122`
- **State**: Closed
- **Created**: 2025-09-01 01:39:49
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041802
- **sys_id**: `63468bdfc3eb6610a01d5673e40131a5`
- **State**: Closed
- **Created**: 2025-08-29 06:18:59
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 4

### CHG0041801
- **sys_id**: `90f424f2c363a210a01d5673e40131c7`
- **State**: Closed
- **Created**: 2025-08-27 05:20:58
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041800
- **sys_id**: `e5c57f2ec32f6210a01d5673e40131f2`
- **State**: Closed
- **Created**: 2025-08-27 01:50:22
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041799
- **sys_id**: `865727aac3eb6210a01d5673e40131bf`
- **State**: Closed
- **Created**: 2025-08-27 00:47:33
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041797
- **sys_id**: `29e1d646c3afe210a01d5673e40131ba`
- **State**: Closed
- **Created**: 2025-08-25 05:25:40
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041796
- **sys_id**: `7aff0682c3afe210a01d5673e4013158`
- **State**: Closed
- **Created**: 2025-08-25 05:13:43
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041795
- **sys_id**: `97304a81c36fee505bcb9df015013151`
- **State**: Closed
- **Created**: 2025-08-22 01:27:02
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041794
- **sys_id**: `7c7a66fcc3a7ae505bcb9df015013191`
- **State**: Closed
- **Created**: 2025-08-21 09:51:23
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041793
- **sys_id**: `67e23468c3efea505bcb9df0150131e8`
- **State**: Closed
- **Created**: 2025-08-20 06:33:33
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041791
- **sys_id**: `4c15abbfc35fe6505bcb9df015013189`
- **State**: Closed
- **Created**: 2025-08-18 11:36:46
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041789
- **sys_id**: `5c8fbdbec317aa50a01d5673e40131e9`
- **State**: Closed
- **Created**: 2025-08-15 01:36:46
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041788
- **sys_id**: `1a2d11a6c3172a50a01d5673e40131a1`
- **State**: Closed
- **Created**: 2025-08-14 04:34:40
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041787
- **sys_id**: `a09a511ac31ba650a01d5673e4013125`
- **State**: Closed
- **Created**: 2025-08-13 09:45:21
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041786
- **sys_id**: `15916c56c353a650a01d5673e4013136`
- **State**: Closed
- **Created**: 2025-08-13 05:31:24
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041780
- **sys_id**: `671e2ee9c39b6250a01d5673e40131f2`
- **State**: Closed
- **Created**: 2025-08-11 07:47:37
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041779
- **sys_id**: `208fb569c3176250a01d5673e4013191`
- **State**: Closed
- **Created**: 2025-08-11 04:24:52
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041778
- **sys_id**: `48c37125c3d36250a01d5673e4013190`
- **State**: Closed
- **Created**: 2025-08-11 03:32:06
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041776
- **sys_id**: `3f9fc768c313ea10a01d5673e4013114`
- **State**: Closed
- **Created**: 2025-08-08 07:39:50
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041773
- **sys_id**: `b5e4d03fc34b2610a01d5673e4013141`
- **State**: Closed
- **Created**: 2025-08-05 10:14:04
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041764
- **sys_id**: `999027d5c30baad05bcb9df0150131e1`
- **State**: Closed
- **Created**: 2025-07-29 06:34:19
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041761
- **sys_id**: `d57f2e09c3cbae14a01d5673e401314f`
- **State**: Closed
- **Created**: 2025-07-28 08:20:28
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041760
- **sys_id**: `e9220a81c307ae14a01d5673e4013113`
- **State**: Closed
- **Created**: 2025-07-28 05:04:02
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041759
- **sys_id**: `6f42c23bc3b622d05bcb9df01501312b`
- **State**: Closed
- **Created**: 2025-07-24 07:51:34
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041758
- **sys_id**: `846f7533c3b622d05bcb9df015013101`
- **State**: Canceled
- **Created**: 2025-07-24 07:37:25
- **State Transitions**: 0
- **Component References**: 1
- **Related Records**: 1

### CHG0041755
- **sys_id**: `ee2d0ab5c3366e90a01d5673e4013131`
- **State**: Closed
- **Created**: 2025-07-18 03:30:39
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041754
- **sys_id**: `d7f23bacc37a2690a01d5673e4013124`
- **State**: Closed
- **Created**: 2025-07-14 13:44:18
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041753
- **sys_id**: `9de45a9bc3aeaa50a01d5673e401316b`
- **State**: Closed
- **Created**: 2025-07-10 09:41:45
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041752
- **sys_id**: `f3e97c4fc3662a50a01d5673e4013117`
- **State**: Closed
- **Created**: 2025-07-09 08:24:10
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041751
- **sys_id**: `d4ef469ec32a22105bcb9df015013140`
- **State**: Closed
- **Created**: 2025-07-07 06:45:08
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041750
- **sys_id**: `060d9912c3e222105bcb9df0150131d3`
- **State**: Closed
- **Created**: 2025-07-07 03:20:23
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041749
- **sys_id**: `6688b61dc3eaaa10a01d5673e4013129`
- **State**: Closed
- **Created**: 2025-07-04 07:12:42
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041748
- **sys_id**: `aa97b0b8c362e610a01d5673e40131e8`
- **State**: Closed
- **Created**: 2025-07-02 08:28:56
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041747
- **sys_id**: `b47914fcc36ea610a01d5673e401312b`
- **State**: Closed
- **Created**: 2025-07-02 06:24:05
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041741
- **sys_id**: `0bcda140c3a6a210a01d5673e401312c`
- **State**: Closed
- **Created**: 2025-06-30 04:28:09
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041740
- **sys_id**: `8b06c6cbc39ea6905bcb9df01501315a`
- **State**: Closed
- **Created**: 2025-06-27 03:41:46
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041739
- **sys_id**: `8d75ca0bc39ea6905bcb9df0150131fb`
- **State**: Closed
- **Created**: 2025-06-27 03:38:08
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041738
- **sys_id**: `2e990a6ac35ee2905bcb9df015013100`
- **State**: Closed
- **Created**: 2025-06-25 14:44:10
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041735
- **sys_id**: `a6e02b86c35a62905bcb9df0150131e7`
- **State**: Closed
- **Created**: 2025-06-24 08:13:01
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041733
- **sys_id**: `e6054af1c39aee505bcb9df0150131ac`
- **State**: Closed
- **Created**: 2025-06-23 06:51:49
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041721
- **sys_id**: `aadce262c3022e50a01d5673e4013185`
- **State**: Closed
- **Created**: 2025-06-13 06:59:24
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041719
- **sys_id**: `b534aff1c386aa105bcb9df015013131`
- **State**: Closed
- **Created**: 2025-06-11 03:06:20
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041714
- **sys_id**: `363a8d4bc339e610a01d5673e401314c`
- **State**: Closed
- **Created**: 2025-06-02 03:06:14
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041708
- **sys_id**: `fff10cedc3392a105bcb9df01501317e`
- **State**: Closed
- **Created**: 2025-05-28 05:41:08
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041707
- **sys_id**: `75af33d9c3392a105bcb9df015013179`
- **State**: Closed
- **Created**: 2025-05-28 05:30:57
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041706
- **sys_id**: `b268bf1dc3f52a105bcb9df015013152`
- **State**: Closed
- **Created**: 2025-05-28 04:59:06
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041705
- **sys_id**: `3cdf2b5dc3b52a105bcb9df015013128`
- **State**: Closed
- **Created**: 2025-05-28 04:53:44
- **State Transitions**: 2
- **Component References**: 1
- **Related Records**: 0

### CHG0041676
- **sys_id**: `d23960f0c37da210a01d5673e401314b`
- **State**: Closed
- **Created**: 2025-05-26 00:58:42
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041672
- **sys_id**: `c6c3a333c3296a905bcb9df01501316c`
- **State**: Closed
- **Created**: 2025-05-23 11:38:21
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041669
- **sys_id**: `f4c32633c3616a905bcb9df015013193`
- **State**: Closed
- **Created**: 2025-05-23 07:02:18
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041668
- **sys_id**: `fb3f523bc3216a905bcb9df01501316f`
- **State**: Closed
- **Created**: 2025-05-23 06:44:11
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041667
- **sys_id**: `18bde577c3e92a905bcb9df015013169`
- **State**: Closed
- **Created**: 2025-05-23 03:19:19
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041665
- **sys_id**: `53bc32bec3e5a2905bcb9df0150131d2`
- **State**: Closed
- **Created**: 2025-05-20 07:00:50
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041663
- **sys_id**: `cf44a6a9c3e52a50a01d5673e4013198`
- **State**: Closed
- **Created**: 2025-05-16 07:47:00
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041659
- **sys_id**: `97f45499c325a650a01d5673e4013141`
- **State**: Closed
- **Created**: 2025-05-15 02:11:41
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041641
- **sys_id**: `26e71ba4c3a5e250a01d5673e40131af`
- **State**: Closed
- **Created**: 2025-05-13 08:26:11
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041635
- **sys_id**: `4a6825a4c32de2505bcb9df0150131bc`
- **State**: Closed
- **Created**: 2025-05-13 00:21:09
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041632
- **sys_id**: `2da0ca94c365a2505bcb9df0150131ec`
- **State**: Closed
- **Created**: 2025-05-12 07:28:32
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041631
- **sys_id**: `ad956198c3656250a01d5673e4013119`
- **State**: Closed
- **Created**: 2025-05-12 06:20:08
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041630
- **sys_id**: `6a0e1ddcc3256250a01d5673e4013191`
- **State**: Closed
- **Created**: 2025-05-12 05:00:58
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041629
- **sys_id**: `82769590c3256250a01d5673e401314e`
- **State**: Closed
- **Created**: 2025-05-12 04:31:28
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041622
- **sys_id**: `c657964ac3dde210a01d5673e401312d`
- **State**: Closed
- **Created**: 2025-05-05 09:20:10
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041621
- **sys_id**: `c194d246c3dde210a01d5673e401315e`
- **State**: Closed
- **Created**: 2025-05-05 09:17:13
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041619
- **sys_id**: `54f9a106c3d9e210a01d5673e401310c`
- **State**: Closed
- **Created**: 2025-05-05 06:01:55
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041618
- **sys_id**: `5c06e749c3dd6650ad36b9ff050131b6`
- **State**: Closed
- **Created**: 2025-05-02 12:30:28
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041604
- **sys_id**: `bcadda73c381ee10ad36b9ff05013178`
- **State**: Closed
- **Created**: 2025-04-28 10:02:29
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041601
- **sys_id**: `7631747fc385ae10ad36b9ff05013109`
- **State**: Closed
- **Created**: 2025-04-28 02:19:26
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041599
- **sys_id**: `0709cefac341aa10ad36b9ff050131c3`
- **State**: Closed
- **Created**: 2025-04-25 07:02:40
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041593
- **sys_id**: `c35a7d6ec38daa1066d9bdb4e4013193`
- **State**: Closed
- **Created**: 2025-04-24 10:18:00
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041592
- **sys_id**: `8c097deac38daa1066d9bdb4e4013108`
- **State**: Closed
- **Created**: 2025-04-24 10:09:32
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041590
- **sys_id**: `c274e8aac3452a10ad36b9ff05013102`
- **State**: Closed
- **Created**: 2025-04-24 04:00:04
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041589
- **sys_id**: `bca20c52c3892a1066d9bdb4e4013181`
- **State**: Closed
- **Created**: 2025-04-23 06:53:53
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041588
- **sys_id**: `57300c1ec3492a1066d9bdb4e40131a7`
- **State**: Closed
- **Created**: 2025-04-23 06:42:38
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0

### CHG0041587
- **sys_id**: `122e7b4ac3492a1066d9bdb4e40131ca`
- **State**: Closed
- **Created**: 2025-04-23 06:33:59
- **State Transitions**: 4
- **Component References**: 1
- **Related Records**: 0


## Notes

- All payloads preserve ServiceNow's display_value format for easy reference
- sys_id values are extracted from both flat and nested formats
- Pagination handled automatically for large result sets
- Error handling ensures partial success if some queries fail
