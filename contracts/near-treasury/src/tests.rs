use super::*;
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use near_sdk::testing_env;
use near_sdk::PromiseResult;
use std::panic::{catch_unwind, AssertUnwindSafe};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}
fn context(who: &str, time: u64, attached: u128) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("treasury.testnet"))
        .signer_account_id(account(who))
        .predecessor_account_id(account(who))
        .block_timestamp(time)
        .attached_deposit(NearToken::from_yoctonear(attached))
        .account_balance(NearToken::from_near(100))
        .prepaid_gas(Gas::from_tgas(300));
    builder
}
fn set(who: &str, time: u64, attached: u128) {
    testing_env!(context(who, time, attached).build());
}
fn fresh(veto: bool) -> Treasury {
    set("treasury.testnet", 1, 0);
    near_sdk::mock::with_mocked_blockchain(|blockchain| {
        blockchain.take_storage();
    });
    set("treasury.testnet", 1, 0);
    let mut contract = Treasury::new(account("controller.testnet"), "testnet".into());
    set("sponsor.testnet", 2, 2 * NEAR);
    contract.top_up_reserve("reserve-1".into());
    set("controller.testnet", 3, 0);
    contract.register_round(
        "round-1".into(),
        ASSET.into(),
        U64(10),
        U64(3 * DAY_NS),
        veto,
        vec![account("recipient.testnet")],
    );
    contract
}
fn deposit(contract: &mut Treasury, who: &str, amount: u128, id: &str) {
    set(who, 5, amount);
    contract.deposit("round-1".into(), ASSET.into(), id.into());
}
fn item(id: &str, kind: Kind, who: &str, amount: u128) -> PlanItem {
    PlanItem {
        operation_id: id.into(),
        kind,
        recipient: account(who),
        amount: U128(amount),
    }
}
fn publish(contract: &mut Treasury, items: Vec<PlanItem>) {
    set("controller.testnet", 10, 0);
    let hash = Treasury::hash("round-1", ASSET, &items);
    contract.commit_plan("round-1".into(), ASSET.into(), hash, items);
}
fn payout(contract: &mut Treasury, amount: u128) {
    deposit(contract, "alice.testnet", amount, "deposit-1");
    publish(
        contract,
        vec![item(
            "plan:pay-1",
            Kind::Payout,
            "recipient.testnet",
            amount,
        )],
    );
}
fn rejected(work: impl FnOnce()) {
    assert!(catch_unwind(AssertUnwindSafe(work)).is_err());
}
fn callback(contract: &mut Treasury, op: &str, attempt: u32, success: bool) -> bool {
    testing_env!(
        context("treasury.testnet", DAY_NS + 20, 0).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![if success {
            PromiseResult::Successful(vec![])
        } else {
            PromiseResult::Failed
        }]
    );
    contract.on_transfer(op.into(), attempt)
}

#[test]
fn native_principal_and_operating_reserve_are_separate_exact_units() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR + 123, "deposit-1");
    let custody = contract.get_custody();
    assert_eq!(custody.received.0, NEAR + 123);
    assert_eq!(custody.principal_liability.0, NEAR + 123);
    assert_eq!(custody.operating_topups.0, 2 * NEAR);
    assert_eq!(
        contract
            .get_contribution("round-1".into(), account("alice.testnet"))
            .0,
        NEAR + 123
    );
    assert!(custody.solvent_including_in_flight);
}

#[test]
fn initializer_requires_contract_account_and_declared_testnet() {
    set("attacker.testnet", 1, 0);
    rejected(|| {
        Treasury::new(account("controller.testnet"), "testnet".into());
    });
    set("treasury.testnet", 1, 0);
    rejected(|| {
        Treasury::new(account("controller.testnet"), "mainnet".into());
    });
}

#[test]
fn register_is_controller_only_and_asset_is_not_fiat() {
    let mut contract = fresh(false);
    set("attacker.testnet", 4, 0);
    rejected(|| {
        contract.register_round(
            "round-2".into(),
            ASSET.into(),
            U64(20),
            U64(3 * DAY_NS),
            false,
            vec![],
        );
    });
    set("controller.testnet", 4, 0);
    rejected(|| {
        contract.register_round(
            "round-2".into(),
            "fiat:BDT".into(),
            U64(20),
            U64(3 * DAY_NS),
            false,
            vec![],
        );
    });
}

#[test]
fn registered_round_and_recipients_cannot_be_overwritten() {
    let mut contract = fresh(false);
    set("controller.testnet", 4, 0);
    rejected(|| {
        contract.register_round(
            "round-1".into(),
            ASSET.into(),
            U64(20),
            U64(3 * DAY_NS),
            false,
            vec![account("attacker.testnet")],
        );
    });
}

#[test]
fn zero_principal_is_not_a_deposit() {
    let mut contract = fresh(false);
    rejected(|| {
        deposit(&mut contract, "alice.testnet", 0, "zero");
    });
}

#[test]
fn positive_deposit_requires_preexisting_separate_storage_buffer() {
    let mut contract = fresh(false);
    contract.operating_topups = 0;
    contract.initial_operating_balance = 0;
    rejected(|| {
        deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    });
}

#[test]
fn deposit_nonce_is_global_and_original_source_is_predecessor() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    rejected(|| {
        deposit(&mut contract, "bob.testnet", NEAR, "deposit-1");
    });
    assert_eq!(
        contract
            .get_operation("deposit-1".into())
            .unwrap()
            .recipient,
        account("alice.testnet")
    );
}

#[test]
fn deposit_after_collection_or_wrong_asset_is_rejected() {
    let mut contract = fresh(false);
    set("alice.testnet", 10, NEAR);
    rejected(|| {
        contract.deposit("round-1".into(), ASSET.into(), "late".into());
    });
    set("alice.testnet", 5, NEAR);
    rejected(|| {
        contract.deposit(
            "round-1".into(),
            "near:mainnet:NEAR".into(),
            "foreign".into(),
        );
    });
}

#[test]
fn plan_hash_binds_round_asset_order_recipient_and_amount() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    let items = vec![item("plan:pay-1", Kind::Payout, "recipient.testnet", NEAR)];
    let hash = Treasury::hash("round-1", ASSET, &items);
    assert_eq!(hash.len(), 64);
    assert_ne!(hash, Treasury::hash("round-2", ASSET, &items));
    let payload = near_sdk::serde_json::to_string(&("round-1", ASSET, &items)).unwrap();
    assert_eq!(payload, "[\"round-1\",\"near:testnet:NEAR\",[{\"operation_id\":\"plan:pay-1\",\"kind\":\"PAYOUT\",\"recipient\":\"recipient.testnet\",\"amount\":\"1000000000000000000000000\"}]]");
    set("controller.testnet", 10, 0);
    rejected(|| {
        contract.commit_plan("round-1".into(), ASSET.into(), "0".repeat(64), items);
    });
}

#[test]
fn allocation_publication_is_controller_only_and_after_collection() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    let items = vec![item("plan:pay-1", Kind::Payout, "recipient.testnet", NEAR)];
    let hash = Treasury::hash("round-1", ASSET, &items);
    set("attacker.testnet", 10, 0);
    rejected(|| {
        contract.commit_plan("round-1".into(), ASSET.into(), hash.clone(), items.clone());
    });
    set("controller.testnet", 9, 0);
    rejected(|| {
        contract.commit_plan("round-1".into(), ASSET.into(), hash, items);
    });
}

#[test]
fn allocation_cannot_exceed_or_omit_received_principal() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    rejected(|| {
        publish(
            &mut contract,
            vec![item(
                "plan:pay-1",
                Kind::Payout,
                "recipient.testnet",
                NEAR + 1,
            )],
        );
    });
    rejected(|| {
        publish(
            &mut contract,
            vec![item(
                "plan:pay-1",
                Kind::Payout,
                "recipient.testnet",
                NEAR - 1,
            )],
        );
    });
}

#[test]
fn payout_recipient_must_be_allowlisted_before_collection() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    rejected(|| {
        publish(
            &mut contract,
            vec![item("plan:pay-1", Kind::Payout, "attacker.testnet", NEAR)],
        );
    });
}

#[test]
fn refunds_cannot_be_redirected_or_exceed_each_original_source() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    deposit(&mut contract, "bob.testnet", NEAR, "deposit-2");
    rejected(|| {
        publish(
            &mut contract,
            vec![item(
                "plan:refund",
                Kind::Refund,
                "attacker.testnet",
                2 * NEAR,
            )],
        );
    });
    rejected(|| {
        publish(
            &mut contract,
            vec![item("plan:refund", Kind::Refund, "alice.testnet", 2 * NEAR)],
        );
    });
    rejected(|| {
        publish(
            &mut contract,
            vec![
                item("plan:refund-a", Kind::Refund, "alice.testnet", NEAR),
                item("plan:refund-b", Kind::Refund, "alice.testnet", NEAR),
            ],
        );
    });
}

#[test]
fn duplicate_allocation_nonces_and_deposit_nonce_reuse_are_rejected() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    rejected(|| {
        publish(
            &mut contract,
            vec![
                item("plan:pay-1", Kind::Payout, "recipient.testnet", NEAR / 2),
                item("plan:pay-1", Kind::Refund, "alice.testnet", NEAR / 2),
            ],
        );
    });
    rejected(|| {
        publish(
            &mut contract,
            vec![item("deposit-1", Kind::Payout, "recipient.testnet", NEAR)],
        );
    });
}

#[test]
fn committed_plan_and_exact_hash_cannot_be_replaced() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR);
    rejected(|| {
        publish(
            &mut contract,
            vec![item("plan:other", Kind::Refund, "alice.testnet", NEAR)],
        );
    });
}

#[test]
fn enabled_veto_uses_chain_publication_time_and_full_24_hours() {
    let mut contract = fresh(true);
    payout(&mut contract, NEAR);
    assert_eq!(
        contract
            .get_round("round-1".into())
            .unwrap()
            .veto_end_ns
            .unwrap()
            .0,
        10 + DAY_NS
    );
    set("controller.testnet", 10 + DAY_NS - 1, 0);
    rejected(|| {
        contract
            .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
            .detach();
    });
    set("controller.testnet", 10 + DAY_NS, 0);
    contract
        .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
        .detach();
    assert_eq!(
        contract.get_operation("plan:pay-1".into()).unwrap().status,
        Status::Pending
    );
}

#[test]
fn execution_rejects_wrong_signer_round_and_asset() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR);
    set("attacker.testnet", 11, 0);
    rejected(|| {
        contract
            .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
            .detach();
    });
    set("controller.testnet", 11, 0);
    contract.register_round(
        "round-2".into(),
        ASSET.into(),
        U64(20),
        U64(3 * DAY_NS),
        false,
        vec![],
    );
    set("controller.testnet", 20, 0);
    let empty_hash = Treasury::hash("round-2", ASSET, &[]);
    contract.commit_plan("round-2".into(), ASSET.into(), empty_hash, vec![]);
    rejected(|| {
        contract
            .execute("round-2".into(), ASSET.into(), "plan:pay-1".into())
            .detach();
    });
    rejected(|| {
        contract
            .execute("round-1".into(), "fiat:USD".into(), "plan:pay-1".into())
            .detach();
    });
}

#[test]
fn pending_nonce_never_submits_twice_and_transfer_is_exact() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR + 123);
    contract
        .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
        .detach();
    let receipts = get_created_receipts();
    assert_eq!(receipts.len(), 2);
    assert_eq!(receipts[0].receiver_id, account("recipient.testnet"));
    assert_eq!(receipts[1].receiver_id, account("treasury.testnet"));
    rejected(|| {
        contract
            .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
            .detach();
    });
    assert_eq!(contract.get_custody().in_flight.0, NEAR + 123);
    assert_eq!(contract.get_custody().principal_liability.0, NEAR + 123);
}

#[test]
fn successful_callback_is_exactly_once_and_conserves_principal() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR + 123);
    contract
        .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
        .detach();
    assert!(callback(&mut contract, "plan:pay-1", 1, true));
    assert!(callback(&mut contract, "plan:pay-1", 1, true));
    let custody = contract.get_custody();
    assert_eq!(custody.paid.0, NEAR + 123);
    assert_eq!(custody.in_flight.0, 0);
    assert_eq!(custody.principal_liability.0, 0);
    assert_eq!(
        custody.received.0,
        custody.principal_liability.0 + custody.paid.0 + custody.refunded.0
    );
    set("controller.testnet", DAY_NS + 21, 0);
    rejected(|| {
        contract
            .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
            .detach();
    });
}

#[test]
fn failed_callback_retains_principal_and_only_proven_failure_can_retry() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR);
    contract
        .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
        .detach();
    assert!(!callback(&mut contract, "plan:pay-1", 1, false));
    assert_eq!(contract.get_custody().principal_liability.0, NEAR);
    assert_eq!(contract.get_custody().paid.0, 0);
    set("controller.testnet", DAY_NS + 21, 0);
    contract
        .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
        .detach();
    assert_eq!(
        contract.get_operation("plan:pay-1".into()).unwrap().attempt,
        2
    );
    assert!(!callback(&mut contract, "plan:pay-1", 1, true)); // Stale attempt must not alter current pending state.
    assert_eq!(
        contract.get_operation("plan:pay-1".into()).unwrap().status,
        Status::Pending
    );
    assert!(callback(&mut contract, "plan:pay-1", 2, true));
    assert_eq!(contract.get_custody().paid.0, NEAR);
}

#[test]
fn a_caller_cannot_forge_private_success_callback() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR);
    contract
        .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
        .detach();
    set("attacker.testnet", 12, 0);
    rejected(|| {
        contract.on_transfer("plan:pay-1".into(), 1);
    });
    assert_eq!(
        contract.get_operation("plan:pay-1".into()).unwrap().status,
        Status::Pending
    );
}

#[test]
fn refund_success_is_separate_from_payout_and_returns_original_source() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    publish(
        &mut contract,
        vec![item("plan:refund-1", Kind::Refund, "alice.testnet", NEAR)],
    );
    set("untrusted-relayer.testnet", 11, 0);
    contract
        .execute("round-1".into(), ASSET.into(), "plan:refund-1".into())
        .detach();
    assert_eq!(
        get_created_receipts()[0].receiver_id,
        account("alice.testnet")
    );
    assert!(callback(&mut contract, "plan:refund-1", 1, true));
    let custody = contract.get_custody();
    assert_eq!(custody.refunded.0, NEAR);
    assert_eq!(custody.paid.0, 0);
}

#[test]
fn successful_veto_cancels_payouts_preserves_history_and_refunds_all_sources() {
    let mut contract = fresh(true);
    deposit(&mut contract, "alice.testnet", 2 * NEAR, "deposit-1");
    deposit(&mut contract, "bob.testnet", NEAR, "deposit-2");
    publish(
        &mut contract,
        vec![item(
            "plan:pay-1",
            Kind::Payout,
            "recipient.testnet",
            3 * NEAR,
        )],
    );
    set("controller.testnet", 11, 0);
    contract.reject_round("round-1".into(), ASSET.into());
    assert_eq!(
        contract.get_operation("plan:pay-1".into()).unwrap().status,
        Status::Cancelled
    );
    let round = contract.get_round("round-1".into()).unwrap();
    assert!(round.rejected);
    assert_ne!(round.allocation_hash, round.original_allocation_hash);
    assert_eq!(round.operation_ids.len(), 2);
    let a = contract
        .get_operation(round.operation_ids[0].clone())
        .unwrap();
    assert_eq!(a.recipient, account("alice.testnet"));
    assert_eq!(a.amount.0, 2 * NEAR);
    rejected(|| {
        contract
            .execute("round-1".into(), ASSET.into(), a.operation_id.clone())
            .detach();
    });
    set("controller.testnet", DAY_NS + 10, 0);
    rejected(|| {
        contract
            .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
            .detach();
    });
    contract
        .execute("round-1".into(), ASSET.into(), a.operation_id.clone())
        .detach();
    assert!(callback(&mut contract, &a.operation_id, 1, true));
}

#[test]
fn late_veto_cannot_replace_a_plan() {
    let mut contract = fresh(true);
    payout(&mut contract, NEAR);
    set("controller.testnet", DAY_NS + 10, 0);
    rejected(|| {
        contract.reject_round("round-1".into(), ASSET.into());
    });
}

#[test]
fn expiry_recovers_uncommitted_principal_to_exact_sources_without_controller() {
    let mut contract = fresh(false);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    set("alice.testnet", 3 * DAY_NS - 1, 0);
    rejected(|| {
        contract.recovery_refund("round-1".into(), ASSET.into());
    });
    set("anyone.testnet", 3 * DAY_NS, 0);
    let round = contract.recovery_refund("round-1".into(), ASSET.into());
    assert!(round.recovery);
    assert_eq!(round.operation_ids, vec!["expiry-refund:round-1:0"]);
    let operation = contract
        .get_operation(round.operation_ids[0].clone())
        .unwrap();
    assert_eq!(operation.kind, Kind::Refund);
    assert_eq!(operation.recipient, account("alice.testnet"));
    assert_eq!(operation.amount.0, NEAR);
    set("alice.testnet", 3 * DAY_NS, 0);
    contract
        .execute("round-1".into(), ASSET.into(), operation.operation_id)
        .detach();
    assert_eq!(
        get_created_receipts()[0].receiver_id,
        account("alice.testnet")
    );
}

#[test]
fn observed_opening_operator_funding_covers_storage_without_double_counting_topups() {
    set("treasury.testnet", 1, 0);
    near_sdk::mock::with_mocked_blockchain(|blockchain| {
        blockchain.take_storage();
    });
    let mut builder = context("treasury.testnet", 1, 0);
    builder.account_balance(NearToken::from_near(5));
    testing_env!(builder.build());
    let mut contract = Treasury::new(account("controller.testnet"), "testnet".into());
    assert_eq!(contract.get_custody().initial_operating_balance.0, 5 * NEAR);
    assert_eq!(contract.get_custody().operating_topups.0, 0);
    let mut builder = context("controller.testnet", 3, 0);
    builder.account_balance(NearToken::from_near(5));
    testing_env!(builder.build());
    contract.register_round(
        "round-1".into(),
        ASSET.into(),
        U64(10),
        U64(3 * DAY_NS),
        false,
        vec![],
    );
    assert!(contract.get_custody().solvent_including_in_flight);
    assert_eq!(contract.get_custody().principal_liability.0, 0);
}

#[test]
fn expiry_never_erases_published_or_unknown_operations() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR);
    set("controller.testnet", 3 * DAY_NS, 0);
    rejected(|| {
        contract.recovery_refund("round-1".into(), ASSET.into());
    });
    contract
        .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
        .detach();
    rejected(|| {
        contract.recovery_refund("round-1".into(), ASSET.into());
    });
    assert_eq!(
        contract.get_operation("plan:pay-1".into()).unwrap().status,
        Status::Pending
    );
}

#[test]
fn malformed_ids_duplicate_recipients_and_truncated_veto_are_rejected() {
    let mut contract = fresh(false);
    set("controller.testnet", 4, 0);
    rejected(|| {
        contract.register_round(
            "bad|id".into(),
            ASSET.into(),
            U64(20),
            U64(3 * DAY_NS),
            true,
            vec![],
        );
    });
    rejected(|| {
        contract.register_round(
            "new".into(),
            ASSET.into(),
            U64(20),
            U64(DAY_NS),
            true,
            vec![],
        );
    });
    rejected(|| {
        contract.register_round(
            "new".into(),
            ASSET.into(),
            U64(20),
            U64(3 * DAY_NS),
            false,
            vec![account("alice.testnet"), account("alice.testnet")],
        );
    });
}

#[test]
fn reserve_nonce_and_minimum_prevent_storage_subsidy_spam() {
    let mut contract = fresh(false);
    set("sponsor.testnet", 4, 1);
    rejected(|| {
        contract.top_up_reserve("small".into());
    });
    set("sponsor.testnet", 4, NEAR);
    rejected(|| {
        contract.top_up_reserve("reserve-1".into());
    });
}

#[test]
fn outsiders_cannot_preempt_settlement_or_deterministic_recovery_nonces() {
    let mut contract = fresh(false);
    for nonce in [
        "plan:pay-1",
        "veto-refund:round-1:0",
        "expiry-refund:round-1:0",
    ] {
        set("alice.testnet", 5, NEAR);
        rejected(|| {
            contract.deposit("round-1".into(), ASSET.into(), nonce.into());
        });
        set("sponsor.testnet", 5, NEAR);
        rejected(|| {
            contract.top_up_reserve(nonce.into());
        });
        assert!(contract.get_operation(nonce.into()).is_none());
    }
}

#[test]
fn a_nonempty_success_response_is_unknown_and_never_becomes_retriable_failure() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR);
    contract
        .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
        .detach();
    testing_env!(
        context("treasury.testnet", DAY_NS + 20, 0).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![PromiseResult::Successful(vec![1])]
    );
    rejected(|| {
        contract.on_transfer("plan:pay-1".into(), 1);
    });
    assert_eq!(
        contract.get_operation("plan:pay-1".into()).unwrap().status,
        Status::Pending
    );
    assert_eq!(contract.get_custody().principal_liability.0, NEAR);
}

#[test]
fn publication_rejects_wrong_asset_zero_items_and_a_truncated_veto_period() {
    let mut contract = fresh(true);
    deposit(&mut contract, "alice.testnet", NEAR, "deposit-1");
    let items = vec![item("plan:pay-1", Kind::Payout, "recipient.testnet", NEAR)];
    set("controller.testnet", 10, 0);
    rejected(|| {
        contract.commit_plan(
            "round-1".into(),
            "near:mainnet:NEAR".into(),
            "0".repeat(64),
            items.clone(),
        );
    });
    rejected(|| {
        publish(
            &mut contract,
            vec![item("plan:zero", Kind::Payout, "recipient.testnet", 0)],
        );
    });
    set("controller.testnet", 3 * DAY_NS - 1, 0);
    let hash = Treasury::hash("round-1", ASSET, &items);
    rejected(|| {
        contract.commit_plan("round-1".into(), ASSET.into(), hash, items);
    });
    assert!(contract
        .get_round("round-1".into())
        .unwrap()
        .allocation_hash
        .is_none());
}

#[test]
fn execution_requires_a_liquid_operating_buffer_and_callback_gas() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR);
    let mut builder = context("controller.testnet", 11, 0);
    builder.prepaid_gas(Gas::from_tgas(99));
    testing_env!(builder.build());
    rejected(|| {
        contract
            .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
            .detach();
    });
    let mut builder = context("controller.testnet", 11, 0);
    builder.account_balance(NearToken::from_yoctonear(NEAR));
    testing_env!(builder.build());
    rejected(|| {
        contract
            .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
            .detach();
    });
    assert_eq!(
        contract.get_operation("plan:pay-1".into()).unwrap().status,
        Status::Ready
    );
    assert_eq!(contract.get_custody().principal_liability.0, NEAR);
}

#[test]
fn published_workload_limits_are_enforced_before_accepting_more_principal() {
    let mut contract = fresh(false);
    let mut round = contract.get_round("round-1".into()).unwrap();
    round.deposit_count = MAX_DEPOSITS;
    contract.rounds.insert(&round.round_id, &round);
    rejected(|| {
        deposit(&mut contract, "alice.testnet", 1, "deposit-over-limit");
    });
    assert_eq!(contract.get_custody().received.0, 0);
    let items = vec![item("plan:too-many", Kind::Payout, "recipient.testnet", 1); MAX_ITEMS + 1];
    rejected(|| {
        publish(&mut contract, items);
    });
}

#[test]
fn a_callback_without_its_transfer_result_retains_pending_principal() {
    let mut contract = fresh(false);
    payout(&mut contract, NEAR);
    contract
        .execute("round-1".into(), ASSET.into(), "plan:pay-1".into())
        .detach();
    set("treasury.testnet", 12, 0);
    rejected(|| {
        contract.on_transfer("plan:pay-1".into(), 1);
    });
    assert_eq!(
        contract.get_operation("plan:pay-1".into()).unwrap().status,
        Status::Pending
    );
    assert_eq!(contract.get_custody().principal_liability.0, NEAR);
}
