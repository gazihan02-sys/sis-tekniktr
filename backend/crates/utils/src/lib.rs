use common::models::Task;
use log::info;

pub fn process_task(task: &Task) {
    info!("Processing task: {} ({})", task.name, task.id);
    println!("Processed payload: {}", task.payload);
}
