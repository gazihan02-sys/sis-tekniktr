use common::models::Task;
use common::init_common;
use utils::process_task;
use log::info;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();
    info!("Automation Engine Starting...");
    
    init_common();
    
    let task = Task::new("Sample Task", "{\"action\": \"run\"}");
    process_task(&task);
    
    // Simulate long running process
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        info!("Engine heartbeat...");
    }
}
