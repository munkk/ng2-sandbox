import { jobLine } from '../services';
import { Log } from '../infrastructure';
import { View } from '../view/view';

export class ViewCtrl extends View {
	constructor(view, gridService) {
		super(view.model);

		this.view = view;
		this.watch(gridService);
	}

	invalidate() {
		const style = this.view.style;
		if (style.needInvalidate()) {
			const rowMonitor = style.monitor.row;
			const cellMonitor = style.monitor.cell;

			const domCell = cellMonitor.enter();
			const domRow = rowMonitor.enter();
			try {
				style.invalidate(domCell, domRow);
			}
			finally {
				rowMonitor.exit();
				cellMonitor.exit();
			}
		}
	}

	triggerLine(service, timeout) {
		const job = jobLine(timeout);
		const model = this.model;
		const reduce = model.pipe().reduce;
		let sessionUnits = [];

		return (name, changes, units) => {
			sessionUnits.push(...units);
			job(() => {
				const jobUnits = reduce(sessionUnits, model);
				sessionUnits = [];

				jobUnits.forEach(unit => service.invalidate(name, changes, unit));
			});
		};
	}

	watch(service) {
		const sceneJob = jobLine(10);
		const triggerJob = this.triggerLine(service, 10);

		const model = this.model;
		const triggers = model.pipe().triggers;

		triggerJob('grid', {}, [model.data().pipe]);

		Object.keys(triggers)
			.forEach(name =>
				this.using(model[name + 'Changed']
					.watch(e => {
						if (e.tag.behavior === 'core') {
							return;
						}

						const units = [];
						const trigger = triggers[name];
						for (const key in e.changes) {
							const unit = trigger[key];
							if (unit) {
								units.push(unit);
							}
						}

						if (units.length > 0) {
							triggerJob(e.tag.source || name, e.changes, units);
						}
					})));

		model.sceneChanged.watch(e => {
			if (e.hasChanges('round')) {
				Log.info(e.tag.source, `scene ${e.state.round}`);

				if (e.state.status === 'start') {
					sceneJob(() => {
						Log.info(e.tag.source, 'scene stop');

						model.scene({
							round: 0,
							status: 'stop'
						}, {
							source: 'view.ctrl',
							behavior: 'core'
						});
					});
				}
			}
		});
	}
}