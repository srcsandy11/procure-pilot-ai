window.PPData = {
  "fixture": {
    "orders": [
      {
        "id": "SO-1001",
        "sku": "T20",
        "quantity": 100,
        "unit": "each",
        "destination": "Bhubaneswar",
        "deadline": "2026-11-27T17:00:00+05:30",
        "certificate_required": true
      }
    ],
    "split_decisions": [
      {
        "order_id": "SO-1001",
        "recorded_at": "2026-11-20T10:00:00+05:30",
        "allowed": true,
        "evidence": "CUSTOMER-ACK-1"
      }
    ],
    "plans": [
      {
        "id": "DIRECT-A",
        "order_id": "SO-1001",
        "legs": [
          {
            "source": "QUOTE-A",
            "quantity": 100
          }
        ]
      },
      {
        "id": "SPLIT-B",
        "order_id": "SO-1001",
        "legs": [
          {
            "source": "QUOTE-B",
            "quantity": 80
          },
          {
            "source": "WH-1",
            "quantity": 20
          }
        ]
      }
    ],
    "offers": [
      {
        "source": "QUOTE-A",
        "revision": 1,
        "recorded_at": "2026-11-19T09:00:00+05:30",
        "sku": "T20",
        "unit": "each",
        "available": 100,
        "destination": "Bhubaneswar",
        "certificate": true,
        "dispatch": "2026-11-26T09:00:00+05:30",
        "arrival": null,
        "valid_until": "2026-11-25T17:00:00+05:30"
      },
      {
        "source": "QUOTE-B",
        "revision": 1,
        "recorded_at": "2026-11-19T09:00:00+05:30",
        "sku": "T20",
        "unit": "each",
        "available": 80,
        "destination": "Bhubaneswar",
        "certificate": true,
        "dispatch": null,
        "arrival": "2026-11-26T16:00:00+05:30",
        "valid_until": "2026-11-25T17:00:00+05:30"
      },
      {
        "source": "WH-1",
        "revision": 1,
        "recorded_at": "2026-11-19T09:00:00+05:30",
        "sku": "T20",
        "unit": "each",
        "available": 20,
        "destination": "Bhubaneswar",
        "certificate": true,
        "dispatch": null,
        "arrival": null,
        "valid_until": "2026-11-25T17:00:00+05:30"
      },
      {
        "source": "WH-1",
        "revision": 2,
        "recorded_at": "2026-11-20T11:00:00+05:30",
        "sku": "T20",
        "unit": "each",
        "available": 20,
        "destination": "Bhubaneswar",
        "certificate": true,
        "dispatch": null,
        "arrival": "2026-11-27T12:00:00+05:30",
        "valid_until": "2026-11-25T17:00:00+05:30"
      },
      {
        "source": "QUOTE-B",
        "revision": 2,
        "recorded_at": "2026-11-21T09:00:00+05:30",
        "sku": "T20",
        "unit": "each",
        "available": 80,
        "destination": "Bhubaneswar",
        "certificate": true,
        "dispatch": null,
        "arrival": "2026-11-30T12:00:00+05:30",
        "valid_until": "2026-11-25T17:00:00+05:30"
      }
    ]
  },
  "stages": {
    "initial": [
      {
        "stage": "initial",
        "order": "SO-1001",
        "plan": "DIRECT-A",
        "as_of": "2026-11-19T12:00:00+05:30",
        "verdict": "needs confirmation",
        "findings": [
          {
            "status": "unknown",
            "evidence": "QUOTE-A v1",
            "owner": "Procurement",
            "action": "Confirm arrival of 100 units in Bhubaneswar by 2026-11-27T17:00:00+05:30."
          }
        ],
        "evidence": [
          "SO-1001",
          "QUOTE-A v1"
        ]
      },
      {
        "stage": "initial",
        "order": "SO-1001",
        "plan": "SPLIT-B",
        "as_of": "2026-11-19T12:00:00+05:30",
        "verdict": "needs confirmation",
        "findings": [
          {
            "status": "unknown",
            "evidence": "SO-1001",
            "owner": "Sales",
            "action": "Ask the customer to confirm split delivery."
          },
          {
            "status": "unknown",
            "evidence": "WH-1 v1",
            "owner": "Procurement",
            "action": "Confirm arrival of 20 units in Bhubaneswar by 2026-11-27T17:00:00+05:30."
          }
        ],
        "evidence": [
          "SO-1001",
          "QUOTE-B v1",
          "WH-1 v1"
        ]
      }
    ],
    "confirmed": [
      {
        "stage": "confirmed",
        "order": "SO-1001",
        "plan": "DIRECT-A",
        "as_of": "2026-11-20T12:00:00+05:30",
        "verdict": "needs confirmation",
        "findings": [
          {
            "status": "unknown",
            "evidence": "QUOTE-A v1",
            "owner": "Procurement",
            "action": "Confirm arrival of 100 units in Bhubaneswar by 2026-11-27T17:00:00+05:30."
          }
        ],
        "evidence": [
          "SO-1001",
          "QUOTE-A v1"
        ]
      },
      {
        "stage": "confirmed",
        "order": "SO-1001",
        "plan": "SPLIT-B",
        "as_of": "2026-11-20T12:00:00+05:30",
        "verdict": "feasible",
        "findings": [],
        "evidence": [
          "SO-1001",
          "CUSTOMER-ACK-1",
          "QUOTE-B v1",
          "WH-1 v2"
        ]
      }
    ],
    "revised": [
      {
        "stage": "revised",
        "order": "SO-1001",
        "plan": "DIRECT-A",
        "as_of": "2026-11-21T12:00:00+05:30",
        "verdict": "needs confirmation",
        "findings": [
          {
            "status": "unknown",
            "evidence": "QUOTE-A v1",
            "owner": "Procurement",
            "action": "Confirm arrival of 100 units in Bhubaneswar by 2026-11-27T17:00:00+05:30."
          }
        ],
        "evidence": [
          "SO-1001",
          "QUOTE-A v1"
        ]
      },
      {
        "stage": "revised",
        "order": "SO-1001",
        "plan": "SPLIT-B",
        "as_of": "2026-11-21T12:00:00+05:30",
        "verdict": "infeasible",
        "findings": [
          {
            "status": "contradicted",
            "evidence": "QUOTE-B v2",
            "owner": "Procurement",
            "action": "Find earlier supply for 80 units. Arrival is 2026-11-30T12:00:00+05:30."
          }
        ],
        "evidence": [
          "SO-1001",
          "CUSTOMER-ACK-1",
          "QUOTE-B v2",
          "WH-1 v2"
        ]
      }
    ]
  },
  "documents": [
    {
      "id": "SO-1001",
      "order_id": "SO-1001",
      "title": "Customer order",
      "text": "SO-1001 requests quantity: 100 T20 each for Bhubaneswar by 2026-11-27 17:00 +05:30; certificate: required.",
      "model": "T20",
      "roles": [
        "procurement",
        "sales"
      ]
    },
    {
      "id": "QUOTE-A-v1",
      "order_id": "SO-1001",
      "title": "Direct supplier quote",
      "text": "QUOTE-A v1 offers 100 T20 each and a certificate for Bhubaneswar. Dispatch is 2026-11-26; arrival is not confirmed. Terms expire 2026-11-25 17:00 +05:30.",
      "model": "T20",
      "roles": [
        "procurement",
        "sales"
      ],
      "recorded_at": "2026-11-19T09:00:00+05:30"
    },
    {
      "id": "QUOTE-B-v1",
      "order_id": "SO-1001",
      "title": "Supplier quote initial",
      "text": "QUOTE-B v1 offers 80 T20 each with certificate: confirmed. Arrival: 2026-11-26T16:00:00+05:30. Recorded 2026-11-19.",
      "model": "T20",
      "roles": [
        "procurement",
        "sales"
      ],
      "recorded_at": "2026-11-19T09:00:00+05:30",
      "superseded_at": "2026-11-21T09:00:00+05:30"
    },
    {
      "id": "QUOTE-B-v2",
      "order_id": "SO-1001",
      "title": "Supplier quote revised",
      "text": "QUOTE-B v2 offers 80 T20 each with certificate: confirmed. Arrival: 2026-11-30T12:00:00+05:30. Recorded 2026-11-21; this is after the order deadline.",
      "model": "T20",
      "roles": [
        "procurement",
        "sales"
      ],
      "recorded_at": "2026-11-21T09:00:00+05:30"
    },
    {
      "id": "WH-1-v2",
      "order_id": "SO-1001",
      "title": "Warehouse confirmation",
      "text": "WH-1 v2 offers 20 T20 each for Bhubaneswar with certificate: confirmed. Arrival: 2026-11-27T12:00:00+05:30. Recorded 2026-11-20.",
      "model": "T20",
      "roles": [
        "procurement",
        "sales"
      ],
      "recorded_at": "2026-11-20T11:00:00+05:30"
    },
    {
      "id": "CUSTOMER-ACK-1",
      "order_id": "SO-1001",
      "title": "Customer split approval",
      "text": "Customer approved split delivery for SO-1001; recorded 2026-11-20.",
      "model": "T20",
      "roles": [
        "procurement",
        "sales"
      ],
      "recorded_at": "2026-11-20T10:00:00+05:30"
    },
    {
      "id": "DATASHEET-T20",
      "order_id": "SO-1001",
      "model": "T20",
      "roles": [
        "procurement",
        "sales"
      ],
      "title": "T20 datasheet",
      "text": "Fictional T20 datasheet: temperature range -20 to 80 \u00b0C; supply 24 V DC; output 4\u201320 mA. Humidity measurement is not specified."
    },
    {
      "id": "DATASHEET-T20-H",
      "order_id": "SO-1001",
      "model": "T20-H",
      "roles": [
        "procurement",
        "sales"
      ],
      "title": "T20-H datasheet",
      "text": "Fictional T20-H datasheet: temperature range -20 to 80 \u00b0C; supply 24 V DC; output 4\u201320 mA; humidity range 0\u2013100% RH. T20-H is a distinct model."
    },
    {
      "id": "POLICY-SPLIT",
      "order_id": "SO-1001",
      "model": "T20",
      "roles": [
        "procurement",
        "sales"
      ],
      "title": "Split delivery policy",
      "text": "Split delivery requires documented customer approval before committing a plan."
    },
    {
      "id": "POLICY-PRICING",
      "order_id": "SO-1001",
      "model": "T20",
      "roles": [
        "procurement"
      ],
      "title": "Procurement policy",
      "text": "Supplier commercial terms are for procurement review and require approval before commitment."
    }
  ]
};
