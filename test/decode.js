import {decodePackets} from "../src/Util";

// this validates that the decodePackets function properly handles
// incomplete records, returning the correct "leftover" bytes.

// contains 6 complete records and only the header of the 7th record.
// in other words, the last 4 characters of this payload are: \x03!re
// and it is these 4 characters that should be in the leftover.
let payload = 'AyFyZRQudGFnPW1pa3JvdGlrY24xMTctMQ49LmlkPSozMDAwMDAwNBY9ZHN0LWFkZHJlc3M9MC4wLjAu' +
  'MC8wFj1nYXRld2F5PTE5Mi4xNjguMjIyLjEzPWdhdGV3YXktc3RhdHVzPTE5Mi4xNjguMjIyLjEgcmVh' +
  'Y2hhYmxlIHZpYSAgZXRoZXIxCz1kaXN0YW5jZT0xCT1zY29wZT0zMBA9dGFyZ2V0LXNjb3BlPTEwFT12' +
  'cmYtaW50ZXJmYWNlPWV0aGVyMQw9YWN0aXZlPXRydWUNPWR5bmFtaWM9dHJ1ZQw9c3RhdGljPXRydWUP' +
  'PWRpc2FibGVkPWZhbHNlAAMhcmUULnRhZz1taWtyb3Rpa2NuMTE3LTEHPS5pZD0qMRo9ZHN0LWFkZHJl' +
  'c3M9MTAuMC4wLjExMy8zMhE9Z2F0ZXdheT0xMC4wLjAuMTE9Z2F0ZXdheS1zdGF0dXM9MTAuMC4wLjEg' +
  'cmVhY2hhYmxlIHZpYSAgR3VzdGEtVlBOEz1jaGVjay1nYXRld2F5PXBpbmcLPWRpc3RhbmNlPTEJPXNj' +
  'b3BlPTMwED10YXJnZXQtc2NvcGU9MTAMPWFjdGl2ZT10cnVlDD1zdGF0aWM9dHJ1ZQ89ZGlzYWJsZWQ9' +
  'ZmFsc2UaPWNvbW1lbnQ9R3VzdGEgQVBJIEdhdGV3YXkAAyFyZRQudGFnPW1pa3JvdGlrY24xMTctMQc9' +
  'LmlkPSoyGD1kc3QtYWRkcmVzcz0xMC4wLjQuMC8yMhE9Z2F0ZXdheT0xMC4wLjAuMTE9Z2F0ZXdheS1z' +
  'dGF0dXM9MTAuMC4wLjEgcmVhY2hhYmxlIHZpYSAgR3VzdGEtVlBOEz1jaGVjay1nYXRld2F5PXBpbmcL' +
  'PWRpc3RhbmNlPTEJPXNjb3BlPTMwED10YXJnZXQtc2NvcGU9MTAMPWFjdGl2ZT10cnVlDD1zdGF0aWM9' +
  'dHJ1ZQ89ZGlzYWJsZWQ9ZmFsc2UVPWNvbW1lbnQ9Y3VzdG9tIHJvdXRlAAMhcmUULnRhZz1taWtyb3Rp' +
  'a2NuMTE3LTEOPS5pZD0qNDAwNTkwMzUYPWRzdC1hZGRyZXNzPTEwLjAuMC4xLzMyFT1wcmVmLXNyYz0x' +
  'MC4wLjk4LjE4NxI9Z2F0ZXdheT1HdXN0YS1WUE4jPWdhdGV3YXktc3RhdHVzPUd1c3RhLVZQTiByZWFj' +
  'aGFibGULPWRpc3RhbmNlPTAJPXNjb3BlPTEwDD1hY3RpdmU9dHJ1ZQ09ZHluYW1pYz10cnVlDT1jb25u' +
  'ZWN0PXRydWUPPWRpc2FibGVkPWZhbHNlAAMhcmUULnRhZz1taWtyb3Rpa2NuMTE3LTEOPS5pZD0qNDAw' +
  'NUZDRTEcPWRzdC1hZGRyZXNzPTEwLjAuMjU1LjI1NC8zMhU9cHJlZi1zcmM9MTAuMC45OC4xODYYPWdh' +
  'dGV3YXk9R3VzdGEtU3BlZWR0ZXN0KT1nYXRld2F5LXN0YXR1cz1HdXN0YS1TcGVlZHRlc3QgcmVhY2hh' +
  'YmxlCz1kaXN0YW5jZT0wCT1zY29wZT0xMAw9YWN0aXZlPXRydWUNPWR5bmFtaWM9dHJ1ZQ09Y29ubmVj' +
  'dD10cnVlDz1kaXNhYmxlZD1mYWxzZQADIXJlFC50YWc9bWlrcm90aWtjbjExNy0xDj0uaWQ9KjQwMDVF' +
  'OTY5HD1kc3QtYWRkcmVzcz0xOTIuMTY4Ljg3LjAvMjQWPXByZWYtc3JjPTE5Mi4xNjguODcuMQ89Z2F0' +
  'ZXdheT1icmlkZ2UgPWdhdGV3YXktc3RhdHVzPWJyaWRnZSByZWFjaGFibGULPWRpc3RhbmNlPTAJPXNj' +
  'b3BlPTEwDD1hY3RpdmU9dHJ1ZQ09ZHluYW1pYz10cnVlDT1jb25uZWN0PXRydWUPPWRpc2FibGVkPWZh' +
  'bHNlAAMhcmU=';

let buff = Buffer.from(payload, 'base64');

let [packets, leftover] = decodePackets(buff);

let expected_leftover = Buffer.from([0x03, 0x21, 0x72, 0x65]);

let pass = true;

if(packets.length !== 6) {
  pass = false;
  console.log(`expected number of records:`, 6);
  console.log(`                    actual:`, packets.length);
}

if(leftover.compare(expected_leftover) !== 0) {
  pass = false;
  console.log(`expected leftover:`, expected_leftover);
  console.log(`           actual:`, leftover);
}

if(!pass) {
  console.log(`incorrectly parsed payload!`);
  console.log('FAIL');
  process.exit(1);
}

console.log(`PASS`);
