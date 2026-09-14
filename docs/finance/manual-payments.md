# Manual OMR payments

Cash and cheque collections are recorded in OMR as integer baisa.

1. A finance administrator creates a draft payment.
2. Cash may move directly to confirmed after receipt verification.
3. A cheque moves to pending and is confirmed only after bank clearance.
4. Confirmation and the wallet grant occur in one database transaction.
5. Rejection creates no credit.
6. A confirmed payment can only be corrected through a reviewed reversal.

Every transition records actor, time, organization, request ID, and an audit
event. Payment references and cheque details must be redacted from application
logs.
