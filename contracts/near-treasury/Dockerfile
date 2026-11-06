FROM rust:1.95.0-bookworm AS build
WORKDIR /contract
RUN rustup target add wasm32-unknown-unknown
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY src ./src
RUN cargo build --locked --release --target wasm32-unknown-unknown

FROM scratch AS artifact
COPY --from=build /contract/target/wasm32-unknown-unknown/release/fundicate_near_treasury.wasm /fundicate_near_treasury.wasm

