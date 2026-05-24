#[cfg(feature = "enterprise")]
pub mod agent {
    tonic::include_proto!("agent");
}

#[cfg(feature = "agent")]
pub use agent::agent_controller_client::AgentControllerClient;
#[cfg(feature = "agent")]
pub use agent::*;
