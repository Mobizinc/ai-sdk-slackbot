const names = [
  'Infrastructure and Cloud Management',
  'Network Management',
  'Cybersecurity Management',
  'Helpdesk and Endpoint Support - 24/7',
  'Application Administration',
  'Helpdesk and Endpoint Support - Standard Business Hours',
];

console.log('Service Offering name lengths:');
console.log('');

for (const name of names) {
  const length = name.length;
  const status = name === 'Helpdesk and Endpoint Support - Standard Business Hours' ? '❌ FAILED' : '✅ SUCCESS';
  console.log(status, length, 'chars:', name);
}
