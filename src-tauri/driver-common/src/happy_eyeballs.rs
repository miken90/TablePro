//! Concurrent connection attempts across a host's resolved addresses.
//!
//! A hostname routinely resolves to several addresses, and on Windows
//! `localhost` resolves to `::1` *before* `127.0.0.1`. When a server listens
//! only on IPv4 — a WSL2 or Docker port proxy, for example — the IPv6 loopback
//! does not refuse the connection, it silently drops the SYN. A driver that
//! walks the address list serially then pays the operating system's full TCP
//! SYN timeout (~21 s on Windows) before it ever tries the address that works.
//!
//! The fix is the RFC 8305 ("Happy Eyeballs") remedy: start the attempts
//! staggered rather than serially, and take the first one that completes. A
//! black-holed address can then delay a working one by at most the stagger,
//! and the common case — the first address answers — is unchanged.

use std::future::Future;
use std::net::IpAddr;
use std::time::Duration;

use tokio::runtime::Handle;
use tokio::task::JoinSet;

/// RFC 8305 "Connection Attempt Delay". The interval between starting one
/// address attempt and starting the next.
pub const ATTEMPT_DELAY: Duration = Duration::from_millis(250);

/// Resolve `host` to its candidate addresses, keeping the resolver's own
/// ordering and dropping duplicates.
///
/// An address literal (with or without the `[...]` form IPv6 URLs use) is
/// returned as-is, so the common "connect to 127.0.0.1" case never touches the
/// resolver.
pub async fn resolve_candidates(host: &str, port: u16) -> std::io::Result<Vec<IpAddr>> {
    let bare = host
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .unwrap_or(host);
    if let Ok(ip) = bare.parse::<IpAddr>() {
        return Ok(vec![ip]);
    }

    let mut candidates: Vec<IpAddr> = Vec::new();
    for addr in tokio::net::lookup_host((host, port)).await? {
        let ip = addr.ip();
        if !candidates.contains(&ip) {
            candidates.push(ip);
        }
    }
    Ok(candidates)
}

/// Start `count` attempts, the `i`th delayed by `stagger * i`, and resolve to
/// the first one that succeeds.
///
/// Losing attempts are dropped as soon as a winner appears, which closes their
/// half-open sockets.
///
/// `decisive` marks an error that already settles the question — a server that
/// answered and rejected us, say. Waiting on the remaining addresses after one
/// of those cannot change the outcome, so the error is returned at once instead
/// of after the slowest black hole finishes timing out.
///
/// When every attempt fails without a decisive answer the *first* error to
/// arrive is returned rather than the last, on the same reasoning: the address
/// that failed fastest is the one that got closest to a real server.
///
/// Returns `None` only when `count` is zero.
pub async fn race_staggered<T, E, F, Fut, D>(
    count: usize,
    stagger: Duration,
    handle: &Handle,
    mut attempt: F,
    decisive: D,
) -> Option<Result<T, E>>
where
    F: FnMut(usize) -> Fut,
    Fut: Future<Output = Result<T, E>> + Send + 'static,
    T: Send + 'static,
    E: Send + 'static,
    D: Fn(&E) -> bool,
{
    if count == 0 {
        return None;
    }

    let mut set = JoinSet::new();
    for index in 0..count {
        let future = attempt(index);
        let delay = stagger.saturating_mul(index as u32);
        set.spawn_on(
            async move {
                if !delay.is_zero() {
                    tokio::time::sleep(delay).await;
                }
                future.await
            },
            handle,
        );
    }

    let mut first_error = None;
    while let Some(joined) = set.join_next().await {
        match joined {
            Ok(Ok(value)) => return Some(Ok(value)),
            Ok(Err(error)) => {
                if decisive(&error) {
                    return Some(Err(error));
                }
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
            // A panicked or aborted attempt is not an answer about the server;
            // let the remaining attempts speak.
            Err(_) => {}
        }
    }

    first_error.map(Err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};
    use std::time::Instant;

    fn never_decisive(_: &&str) -> bool {
        false
    }

    #[tokio::test]
    async fn ipv4_literal_skips_the_resolver() {
        let got = resolve_candidates("127.0.0.1", 5432).await.unwrap();
        assert_eq!(got, vec![IpAddr::V4(Ipv4Addr::LOCALHOST)]);
    }

    #[tokio::test]
    async fn bracketed_ipv6_literal_skips_the_resolver() {
        let got = resolve_candidates("[::1]", 5432).await.unwrap();
        assert_eq!(got, vec![IpAddr::V6(Ipv6Addr::LOCALHOST)]);
    }

    #[tokio::test]
    async fn localhost_resolves_to_both_loopbacks() {
        let got = resolve_candidates("localhost", 5432).await.unwrap();
        assert!(
            got.contains(&IpAddr::V4(Ipv4Addr::LOCALHOST))
                || got.contains(&IpAddr::V6(Ipv6Addr::LOCALHOST)),
            "localhost resolved to {got:?}"
        );
        let mut seen = got.clone();
        seen.dedup();
        assert_eq!(seen.len(), got.len(), "duplicate addresses in {got:?}");
    }

    /// The regression this module exists for: a first address that never
    /// answers must not hold up a second one that does.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_black_holed_first_address_does_not_stall_a_working_second() {
        let handle = Handle::current();
        let started = Instant::now();

        let winner = race_staggered(
            2,
            Duration::from_millis(20),
            &handle,
            |index| async move {
                if index == 0 {
                    // Stands in for the silently-dropped SYN: never answers
                    // within any time the test would tolerate.
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    Err("black hole")
                } else {
                    Ok("second address")
                }
            },
            never_decisive,
        )
        .await;

        assert_eq!(winner, Some(Ok("second address")));
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "took {:?} — the stalled attempt was still being waited on",
            started.elapsed()
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn the_first_address_still_wins_when_it_answers() {
        let handle = Handle::current();
        let winner = race_staggered(
            2,
            ATTEMPT_DELAY,
            &handle,
            |index| async move {
                if index == 0 {
                    Ok("first address")
                } else {
                    Err("should not have been needed")
                }
            },
            never_decisive,
        )
        .await;
        assert_eq!(winner, Some(Ok("first address")));
    }

    /// A refusal that arrives quickly is more useful than a timeout that
    /// arrives 21 seconds later, so the earliest error is the one reported.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn the_earliest_error_is_reported_when_every_attempt_fails() {
        let handle = Handle::current();
        let outcome: Option<Result<&str, &str>> = race_staggered(
            2,
            Duration::from_millis(10),
            &handle,
            |index| async move {
                if index == 0 {
                    tokio::time::sleep(Duration::from_millis(400)).await;
                    Err("timed out")
                } else {
                    Err("password authentication failed")
                }
            },
            never_decisive,
        )
        .await;
        assert_eq!(outcome, Some(Err("password authentication failed")));
    }

    /// A server that answered and said no settles it: the caller should not
    /// wait out a black-holed sibling address before being told.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_decisive_error_does_not_wait_for_the_black_hole() {
        let handle = Handle::current();
        let started = Instant::now();

        let outcome: Option<Result<&str, &str>> = race_staggered(
            2,
            Duration::from_millis(20),
            &handle,
            |index| async move {
                if index == 0 {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    Err("black hole")
                } else {
                    Err("password authentication failed")
                }
            },
            |error| *error == "password authentication failed",
        )
        .await;

        assert_eq!(outcome, Some(Err("password authentication failed")));
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "took {:?} — the stalled attempt was still being waited on",
            started.elapsed()
        );
    }

    #[tokio::test]
    async fn no_candidates_is_no_answer() {
        let handle = Handle::current();
        let outcome: Option<Result<(), ()>> = race_staggered(
            0,
            ATTEMPT_DELAY,
            &handle,
            |_| async { Ok(()) },
            |_: &()| false,
        )
        .await;
        assert!(outcome.is_none());
    }
}
