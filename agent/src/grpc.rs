#[cfg(feature = "enterprise")]
pub mod agent {
    tonic::include_proto!("agent");
}

#[cfg(feature = "enterprise")]
pub use agent::agent_controller_client::AgentControllerClient;
#[cfg(feature = "enterprise")]
pub use agent::*;
