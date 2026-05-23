pub mod agent_controller;

use sqlx::PgPool;
use tonic::transport::Server;

pub mod agent {
    tonic::include_proto!("agent");
}

pub async fn start_grpc_server(
    pool: PgPool,
    addr: String,
    mtls_store: crate::portal::mtls::MtlsStore,
    admin_grpc_url: String,
) -> Result<(), Box<dyn std::error::Error>> {
    let agent_service = agent_controller::AgentControllerImpl::new(pool, mtls_store, admin_grpc_url);

    Server::builder()
        .add_service(agent::agent_controller_server::AgentControllerServer::new(
            agent_service,
        ))
        .serve(addr.parse()?)
        .await?;

    Ok(())
}
