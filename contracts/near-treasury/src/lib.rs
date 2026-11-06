//! Native testnet custody. Off-chain governance is attested by the configured controller.
//! Principal has no platform fee. Storage/liquid operating buffers must be funded separately.
use near_sdk::collections::LookupMap;
use near_sdk::json_types::{U128, U64};
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};
use std::collections::BTreeMap;

pub const ASSET: &str = "near:testnet:NEAR";
pub const DAY_NS: u64 = 86_400_000_000_000;
pub const MIN_RESERVE: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR, never principal.
const STORAGE_MARGIN_BYTES: u128 = 4096;
const MAX_PARTICIPANTS: usize = 1000;
const MAX_DEPOSITS: u32 = 4096;
const MAX_ITEMS: usize = 2000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Kind {
    Deposit,
    Reserve,
    Payout,
    Refund,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum Status {
    Ready,
    Pending,
    Success,
    Failed,
    Cancelled,
}

/// JSON field order is part of the published SHA-256 commitment contract.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PlanItem {
    pub operation_id: String,
    pub kind: Kind,
    pub recipient: AccountId,
    pub amount: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Operation {
    pub operation_id: String,
    pub round_id: Option<String>,
    pub asset_id: String,
    pub kind: Kind,
    pub recipient: AccountId,
    pub amount: U128,
    pub status: Status,
    pub attempt: u32,
    pub plan_hash: Option<String>,
    pub created_at_ns: U64,
    pub completed_at_ns: Option<U64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Round {
    pub round_id: String,
    pub asset_id: String,
    pub collection_end_ns: U64,
    pub expires_at_ns: U64,
    pub veto_enabled: bool,
    pub recipients: Vec<AccountId>,
    pub contributors: Vec<AccountId>,
    pub deposit_count: u32,
    pub received: U128,
    pub paid: U128,
    pub refunded: U128,
    pub in_flight: U128,
    pub allocation_hash: Option<String>,
    pub original_allocation_hash: Option<String>,
    pub published_at_ns: Option<U64>,
    pub veto_end_ns: Option<U64>,
    pub operation_ids: Vec<String>,
    pub rejected: bool,
    pub recovery: bool,
}

#[near(serializers = [json])]
pub struct Custody {
    pub network: String,
    pub asset_id: String,
    pub controller: AccountId,
    pub account_balance: U128,
    pub storage_cost: U128,
    pub principal_liability: U128,
    pub in_flight: U128,
    pub initial_operating_balance: U128,
    pub operating_topups: U128,
    pub minimum_operating_buffer: U128,
    pub received: U128,
    pub paid: U128,
    pub refunded: U128,
    pub operational_surplus_including_in_flight: U128,
    pub solvent_including_in_flight: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Treasury {
    controller: AccountId,
    rounds: LookupMap<String, Round>,
    operations: LookupMap<String, Operation>,
    contributions: LookupMap<String, u128>,
    principal_liability: u128,
    in_flight: u128,
    initial_operating_balance: u128,
    operating_topups: u128,
    received: u128,
    paid: u128,
    refunded: u128,
}

#[near]
impl Treasury {
    #[init]
    pub fn new(controller: AccountId, network: String) -> Self {
        assert_eq!(
            network, "testnet",
            "Only the declared testnet configuration is supported"
        );
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "Initialize atomically from the contract account"
        );
        Self {
            controller,
            rounds: LookupMap::new(b"r"),
            operations: LookupMap::new(b"o"),
            contributions: LookupMap::new(b"c"),
            principal_liability: 0,
            in_flight: 0,
            // Fresh initialization has no participant liabilities. Its actual opening
            // account balance was separately supplied by the deployment operator.
            initial_operating_balance: env::account_balance().as_yoctonear(),
            operating_topups: 0,
            received: 0,
            paid: 0,
            refunded: 0,
        }
    }

    #[payable]
    pub fn top_up_reserve(&mut self, operation_id: String) -> Operation {
        Self::identifier(&operation_id);
        Self::external_nonce(&operation_id);
        assert!(
            self.operations.get(&operation_id).is_none(),
            "Operation nonce already used"
        );
        let amount = env::attached_deposit().as_yoctonear();
        assert!(
            amount >= MIN_RESERVE,
            "A reserve top-up must contain at least 0.1 NEAR"
        );
        self.operating_topups = self
            .operating_topups
            .checked_add(amount)
            .expect("Reserve overflow");
        let operation = Operation {
            operation_id: operation_id.clone(),
            round_id: None,
            asset_id: ASSET.into(),
            kind: Kind::Reserve,
            recipient: env::current_account_id(),
            amount: U128(amount),
            status: Status::Success,
            attempt: 0,
            plan_hash: None,
            created_at_ns: U64(env::block_timestamp()),
            completed_at_ns: Some(U64(env::block_timestamp())),
        };
        self.operations.insert(&operation_id, &operation);
        Self::event("reserve_topup", &operation);
        operation
    }

    pub fn register_round(
        &mut self,
        round_id: String,
        asset_id: String,
        collection_end_ns: U64,
        expires_at_ns: U64,
        veto_enabled: bool,
        recipients: Vec<AccountId>,
    ) -> Round {
        self.controller();
        Self::identifier(&round_id);
        Self::asset(&asset_id);
        assert!(
            round_id.len() <= 80,
            "Round identifiers are limited to 80 bytes including recovery nonce capacity"
        );
        assert!(
            self.rounds.get(&round_id).is_none(),
            "Round already registered"
        );
        assert!(
            collection_end_ns.0 > env::block_timestamp(),
            "Collection must close in the future"
        );
        assert!(
            expires_at_ns.0
                > collection_end_ns
                    .0
                    .saturating_add(if veto_enabled { DAY_NS } else { 0 }),
            "Expiry must follow collection and the full veto window"
        );
        assert!(
            recipients.len() <= 50,
            "At most 50 precommitted payout recipients"
        );
        let mut sorted = recipients.clone();
        sorted.sort();
        sorted.dedup();
        assert_eq!(sorted.len(), recipients.len(), "Duplicate recipient");
        let round = Round {
            round_id: round_id.clone(),
            asset_id,
            collection_end_ns,
            expires_at_ns,
            veto_enabled,
            recipients,
            contributors: vec![],
            deposit_count: 0,
            received: U128(0),
            paid: U128(0),
            refunded: U128(0),
            in_flight: U128(0),
            allocation_hash: None,
            original_allocation_hash: None,
            published_at_ns: None,
            veto_end_ns: None,
            operation_ids: vec![],
            rejected: false,
            recovery: false,
        };
        self.rounds.insert(&round_id, &round);
        self.buffer();
        Self::event("round_registered", &round);
        round
    }

    #[payable]
    pub fn deposit(
        &mut self,
        round_id: String,
        asset_id: String,
        operation_id: String,
    ) -> Operation {
        Self::identifier(&operation_id);
        Self::external_nonce(&operation_id);
        Self::asset(&asset_id);
        assert!(
            self.operations.get(&operation_id).is_none(),
            "Operation nonce already used"
        );
        let mut round = self.round(&round_id, &asset_id);
        assert!(
            env::block_timestamp() < round.collection_end_ns.0 && round.allocation_hash.is_none(),
            "Collection closed"
        );
        assert!(
            round.deposit_count < MAX_DEPOSITS,
            "Published deposit operation limit reached"
        );
        let amount = env::attached_deposit().as_yoctonear();
        assert!(
            amount > 0,
            "A deposit must contain positive native NEAR principal"
        );
        let owner = env::predecessor_account_id();
        let source_key = Self::source_key(&round_id, &owner);
        let prior = self.contributions.get(&source_key).unwrap_or(0);
        if prior == 0 {
            assert!(
                round.contributors.len() < MAX_PARTICIPANTS,
                "Published contributor limit reached"
            );
            round.contributors.push(owner.clone());
        }
        self.contributions.insert(
            &source_key,
            &prior.checked_add(amount).expect("Source overflow"),
        );
        round.received.0 = round
            .received
            .0
            .checked_add(amount)
            .expect("Round overflow");
        round.deposit_count += 1;
        self.principal_liability = self
            .principal_liability
            .checked_add(amount)
            .expect("Principal overflow");
        self.received = self
            .received
            .checked_add(amount)
            .expect("Received overflow");
        let operation = Operation {
            operation_id: operation_id.clone(),
            round_id: Some(round_id.clone()),
            asset_id,
            kind: Kind::Deposit,
            recipient: owner,
            amount: U128(amount),
            status: Status::Success,
            attempt: 0,
            plan_hash: None,
            created_at_ns: U64(env::block_timestamp()),
            completed_at_ns: Some(U64(env::block_timestamp())),
        };
        self.operations.insert(&operation_id, &operation);
        self.rounds.insert(&round_id, &round);
        self.buffer();
        Self::event("deposit", &operation);
        operation
    }

    pub fn commit_plan(
        &mut self,
        round_id: String,
        asset_id: String,
        allocation_hash: String,
        items: Vec<PlanItem>,
    ) -> Round {
        self.controller();
        let mut round = self.round(&round_id, &asset_id);
        assert!(
            round.allocation_hash.is_none(),
            "An immutable allocation is already committed"
        );
        let now = env::block_timestamp();
        assert!(
            now >= round.collection_end_ns.0 && now < round.expires_at_ns.0,
            "Outside allocation publication period"
        );
        if round.veto_enabled {
            assert!(
                now.checked_add(DAY_NS).unwrap() <= round.expires_at_ns.0,
                "Expiry would truncate the mandatory veto window"
            );
        }
        self.validate_items(&round, &items);
        let expected = Self::hash(&round_id, &asset_id, &items);
        assert_eq!(
            allocation_hash, expected,
            "Allocation hash does not bind the canonical round, asset and items"
        );
        round.original_allocation_hash = Some(expected.clone());
        round.published_at_ns = Some(U64(now));
        round.veto_end_ns = Some(U64(now + if round.veto_enabled { DAY_NS } else { 0 }));
        self.store_plan(&mut round, items, expected);
        self.rounds.insert(&round_id, &round);
        self.buffer();
        Self::event("plan_published", &round);
        round
    }

    /// The controller attests the off-chain 90%-of-frozen-power rejection outcome.
    /// It cannot alter time, redirect refunds, retain a payout or bypass pending transfers.
    pub fn reject_round(&mut self, round_id: String, asset_id: String) -> Round {
        self.controller();
        let mut round = self.round(&round_id, &asset_id);
        assert!(
            round.veto_enabled && round.allocation_hash.is_some() && !round.rejected,
            "No rejectable published veto round"
        );
        assert!(
            env::block_timestamp() < round.veto_end_ns.expect("Missing veto deadline").0,
            "Veto deadline passed"
        );
        assert!(
            round.in_flight.0 == 0 && round.paid.0 == 0 && round.refunded.0 == 0,
            "Cannot replace any submitted or paid plan"
        );
        for id in &round.operation_ids {
            let mut op = self
                .operations
                .get(id)
                .expect("Missing committed operation");
            assert_eq!(
                op.status,
                Status::Ready,
                "Only an entirely unsubmitted plan may be rejected"
            );
            op.status = Status::Cancelled;
            self.operations.insert(id, &op);
        }
        round.rejected = true;
        let items = self.refund_items(&round, "veto-refund");
        self.validate_items(&round, &items);
        let hash = Self::hash(&round_id, &asset_id, &items);
        self.store_plan(&mut round, items, hash);
        self.rounds.insert(&round_id, &round);
        self.buffer();
        Self::event("round_rejected", &round);
        round
    }

    /// Permissionless deterministic recovery is available only if no plan was ever committed.
    /// A published plan remains binding after expiry; pending/failed outcomes cannot be erased.
    pub fn recovery_refund(&mut self, round_id: String, asset_id: String) -> Round {
        let mut round = self.round(&round_id, &asset_id);
        assert!(
            env::block_timestamp() >= round.expires_at_ns.0,
            "Recovery expiry has not passed"
        );
        assert!(
            round.allocation_hash.is_none(),
            "A published plan must be reconciled, never replaced on expiry"
        );
        round.recovery = true;
        round.published_at_ns = Some(U64(env::block_timestamp()));
        round.veto_end_ns = Some(U64(env::block_timestamp()));
        let items = self.refund_items(&round, "expiry-refund");
        self.validate_items(&round, &items);
        let hash = Self::hash(&round_id, &asset_id, &items);
        self.store_plan(&mut round, items, hash);
        self.rounds.insert(&round_id, &round);
        self.buffer();
        Self::event("recovery_published", &round);
        round
    }

    pub fn execute(&mut self, round_id: String, asset_id: String, operation_id: String) -> Promise {
        let mut round = self.round(&round_id, &asset_id);
        assert!(round.allocation_hash.is_some(), "No allocation authority");
        assert!(
            env::block_timestamp() >= round.veto_end_ns.expect("Missing publication deadline").0,
            "Full 24-hour veto window still active"
        );
        assert!(
            env::prepaid_gas().as_gas() >= Gas::from_tgas(100).as_gas(),
            "Attach at least 100 Tgas"
        );
        let mut operation = self
            .operations
            .get(&operation_id)
            .expect("Unknown operation nonce");
        // A deterministic original-source refund cannot benefit its relayer.
        // Let contributors recover without depending on controller availability.
        if operation.kind != Kind::Refund {
            self.controller();
        }
        assert!(
            operation.round_id.as_deref() == Some(round_id.as_str())
                && operation.asset_id == asset_id,
            "Operation scope mismatch"
        );
        assert!(
            operation.plan_hash == round.allocation_hash
                && round.operation_ids.contains(&operation_id),
            "Operation is not in the active immutable allocation"
        );
        assert!(
            operation.status == Status::Ready || operation.status == Status::Failed,
            "Operation already pending, successful or cancelled; reconcile it"
        );
        assert!(
            operation.kind == Kind::Payout || operation.kind == Kind::Refund,
            "Only allocation transfers execute"
        );
        assert!(
            !round.rejected || operation.kind == Kind::Refund,
            "Rejected rounds cannot pay recipients"
        );
        if operation.kind == Kind::Payout {
            assert!(
                round.recipients.contains(&operation.recipient),
                "Recipient not precommitted"
            );
        }
        self.buffer();
        assert!(
            env::account_balance().as_yoctonear()
                >= operation
                    .amount
                    .0
                    .checked_add(self.storage_cost())
                    .unwrap()
                    .checked_add(MIN_RESERVE)
                    .unwrap(),
            "Insufficient liquid balance excluding operating reserve"
        );
        operation.attempt = operation.attempt.checked_add(1).expect("Attempt overflow");
        operation.status = Status::Pending;
        round.in_flight.0 = round.in_flight.0.checked_add(operation.amount.0).unwrap();
        self.in_flight = self.in_flight.checked_add(operation.amount.0).unwrap();
        self.operations.insert(&operation_id, &operation);
        self.rounds.insert(&round_id, &round);
        Self::event("transfer_submitted", &operation);
        Promise::new(operation.recipient.clone())
            .transfer(NearToken::from_yoctonear(operation.amount.0))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_transfer",
                    near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({
                        "operation_id": operation_id, "attempt": operation.attempt
                    }))
                    .unwrap(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(50),
                ),
            )
    }

    #[private]
    pub fn on_transfer(&mut self, operation_id: String, attempt: u32) -> bool {
        // Explicitly enforce privacy in direct Rust calls as well as generated WASM wrappers.
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "Only this contract may deliver transfer results"
        );
        let mut operation = self
            .operations
            .get(&operation_id)
            .expect("Unknown callback operation");
        if operation.status != Status::Pending || operation.attempt != attempt {
            return operation.status == Status::Success;
        }
        assert_eq!(
            env::promise_results_count(),
            1,
            "Expected exactly one transfer result"
        );
        let mut round = self.round(operation.round_id.as_ref().unwrap(), &operation.asset_id);
        // A native transfer returns no bytes; bound the read rather than accepting arbitrary callback data.
        let success = match env::promise_result_checked(0, 0) {
            Ok(_) => true,
            Err(PromiseError::Failed) => false,
            Err(_) => {
                panic!("Unexpected transfer result; retain pending operation for reconciliation")
            }
        };
        round.in_flight.0 = round
            .in_flight
            .0
            .checked_sub(operation.amount.0)
            .expect("Pending principal underflow");
        self.in_flight = self.in_flight.checked_sub(operation.amount.0).unwrap();
        if success {
            operation.status = Status::Success;
            operation.completed_at_ns = Some(U64(env::block_timestamp()));
            self.principal_liability = self
                .principal_liability
                .checked_sub(operation.amount.0)
                .unwrap();
            if operation.kind == Kind::Payout {
                round.paid.0 = round.paid.0.checked_add(operation.amount.0).unwrap();
                self.paid = self.paid.checked_add(operation.amount.0).unwrap();
            } else {
                round.refunded.0 = round.refunded.0.checked_add(operation.amount.0).unwrap();
                self.refunded = self.refunded.checked_add(operation.amount.0).unwrap();
            }
        } else {
            operation.status = Status::Failed;
        }
        self.rounds.insert(&round.round_id, &round);
        self.operations.insert(&operation_id, &operation);
        Self::event(
            if success {
                "transfer_succeeded"
            } else {
                "transfer_failed"
            },
            &operation,
        );
        success
    }

    pub fn get_round(&self, round_id: String) -> Option<Round> {
        self.rounds.get(&round_id)
    }
    pub fn get_operation(&self, operation_id: String) -> Option<Operation> {
        self.operations.get(&operation_id)
    }
    pub fn get_contribution(&self, round_id: String, account_id: AccountId) -> U128 {
        U128(
            self.contributions
                .get(&Self::source_key(&round_id, &account_id))
                .unwrap_or(0),
        )
    }
    pub fn get_custody(&self) -> Custody {
        let balance = env::account_balance().as_yoctonear();
        let storage = self.storage_cost();
        let adjusted = balance.saturating_add(self.in_flight);
        Custody {
            network: "testnet".into(),
            asset_id: ASSET.into(),
            controller: self.controller.clone(),
            account_balance: U128(balance),
            storage_cost: U128(storage),
            principal_liability: U128(self.principal_liability),
            in_flight: U128(self.in_flight),
            initial_operating_balance: U128(self.initial_operating_balance),
            operating_topups: U128(self.operating_topups),
            minimum_operating_buffer: U128(MIN_RESERVE),
            received: U128(self.received),
            paid: U128(self.paid),
            refunded: U128(self.refunded),
            operational_surplus_including_in_flight: U128(
                adjusted
                    .saturating_sub(self.principal_liability)
                    .saturating_sub(storage),
            ),
            solvent_including_in_flight: adjusted
                >= self
                    .principal_liability
                    .saturating_add(storage)
                    .saturating_add(MIN_RESERVE),
        }
    }
    pub fn allocation_hash(round_id: String, asset_id: String, items: Vec<PlanItem>) -> String {
        Self::asset(&asset_id);
        Self::hash(&round_id, &asset_id, &items)
    }
}

impl Treasury {
    fn controller(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.controller,
            "Only the configured governance controller may call this method"
        );
    }
    fn asset(asset: &str) {
        assert_eq!(asset, ASSET, "Unsupported native testnet asset");
    }
    fn identifier(id: &str) {
        assert!(
            !id.is_empty()
                && id.len() <= 128
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_:".contains(&b)),
            "Invalid bounded operation or round identifier"
        );
    }
    fn external_nonce(id: &str) {
        assert!(
            !["plan:", "veto-refund:", "expiry-refund:"]
                .iter()
                .any(|prefix| id.starts_with(prefix)),
            "Settlement and recovery nonce namespaces are reserved"
        );
    }
    fn source_key(round_id: &str, account_id: &AccountId) -> String {
        format!("{round_id}|{account_id}")
    }
    fn round(&self, id: &str, asset: &str) -> Round {
        Self::asset(asset);
        let round = self
            .rounds
            .get(&id.to_string())
            .expect("Unknown registered round");
        assert_eq!(round.asset_id, asset, "Round asset mismatch");
        round
    }
    fn storage_cost(&self) -> u128 {
        (u128::from(env::storage_usage()) + STORAGE_MARGIN_BYTES)
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .expect("Storage cost overflow")
    }
    fn buffer(&self) {
        let required = self.storage_cost().checked_add(MIN_RESERVE).unwrap();
        assert!(self.initial_operating_balance.checked_add(self.operating_topups).expect("Operating funding overflow") >= required, "Top up the separate operating reserve; principal cannot fund storage or operating costs");
        let unsubmitted_principal = self
            .principal_liability
            .checked_sub(self.in_flight)
            .expect("Invalid pending accounting");
        assert!(
            env::account_balance().as_yoctonear()
                >= unsubmitted_principal.checked_add(required).unwrap(),
            "Custody deficit or exhausted operating reserve; principal is protected"
        );
    }
    fn hash(round_id: &str, asset: &str, items: &[PlanItem]) -> String {
        let payload = near_sdk::serde_json::to_vec(&(round_id, asset, items))
            .expect("Canonical payload serialization");
        env::sha256(&payload)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }
    fn validate_items(&self, round: &Round, items: &[PlanItem]) {
        assert!(
            items.len() <= MAX_ITEMS,
            "At most 2000 immutable allocation items"
        );
        let mut total: u128 = 0;
        let mut refunds: BTreeMap<AccountId, u128> = BTreeMap::new();
        let mut ids = std::collections::BTreeSet::new();
        for item in items {
            Self::identifier(&item.operation_id);
            if !round.rejected && !round.recovery {
                assert!(
                    item.operation_id.starts_with("plan:"),
                    "Original allocation nonces require the protected plan: namespace"
                );
            }
            assert!(
                ids.insert(&item.operation_id) && self.operations.get(&item.operation_id).is_none(),
                "Duplicate or reused operation nonce"
            );
            assert!(
                item.amount.0 > 0,
                "Allocation items require positive principal"
            );
            total = total
                .checked_add(item.amount.0)
                .expect("Allocation overflow");
            match item.kind {
                Kind::Payout => {
                    assert!(
                        !round.rejected && !round.recovery,
                        "Only original-source refunds are allowed"
                    );
                    assert!(
                        round.recipients.contains(&item.recipient),
                        "Payout recipient was not registered before collection"
                    );
                }
                Kind::Refund => {
                    let source = self
                        .contributions
                        .get(&Self::source_key(&round.round_id, &item.recipient))
                        .unwrap_or(0);
                    let sum = refunds.entry(item.recipient.clone()).or_default();
                    *sum = sum.checked_add(item.amount.0).expect("Refund overflow");
                    assert!(
                        *sum <= source,
                        "A refund must return principal only to its original contributing account"
                    );
                }
                _ => panic!("Only PAYOUT or REFUND items can be allocated"),
            }
        }
        assert_eq!(total, round.received.0, "Allocate every received unit exactly once, including explicit original-source residual refunds");
    }
    fn store_plan(&mut self, round: &mut Round, items: Vec<PlanItem>, hash: String) {
        round.operation_ids.clear();
        round.allocation_hash = Some(hash.clone());
        for item in items {
            round.operation_ids.push(item.operation_id.clone());
            self.operations.insert(
                &item.operation_id,
                &Operation {
                    operation_id: item.operation_id.clone(),
                    round_id: Some(round.round_id.clone()),
                    asset_id: round.asset_id.clone(),
                    kind: item.kind,
                    recipient: item.recipient,
                    amount: item.amount,
                    status: Status::Ready,
                    attempt: 0,
                    plan_hash: Some(hash.clone()),
                    created_at_ns: U64(env::block_timestamp()),
                    completed_at_ns: None,
                },
            );
        }
    }
    fn refund_items(&self, round: &Round, prefix: &str) -> Vec<PlanItem> {
        round
            .contributors
            .iter()
            .enumerate()
            .map(|(index, owner)| PlanItem {
                operation_id: format!("{prefix}:{}:{index}", round.round_id),
                kind: Kind::Refund,
                recipient: owner.clone(),
                amount: U128(
                    self.contributions
                        .get(&Self::source_key(&round.round_id, owner))
                        .expect("Missing original principal source"),
                ),
            })
            .collect()
    }
    fn event<T: near_sdk::serde::Serialize>(name: &str, data: &T) {
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::to_string(&near_sdk::serde_json::json!({
                "standard":"fundicate", "version":"1.0.0", "event":name, "data":[data]
            }))
            .unwrap()
        ));
    }
}

#[cfg(test)]
mod tests;
