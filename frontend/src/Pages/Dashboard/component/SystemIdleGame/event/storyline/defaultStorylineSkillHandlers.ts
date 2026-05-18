import { StorylineSkillRegistry } from './StorylineSkillRegistry';
import type { StorylineChoiceOption } from './StorylineRuntimeTypes';

function numberArg(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeChoices(value: unknown): StorylineChoiceOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((choice): choice is Record<string, unknown> => Boolean(choice && typeof choice === 'object'))
    .map((choice) => ({
      id: String(choice.id ?? ''),
      label: String(choice.label ?? ''),
      reply: typeof choice.reply === 'string' ? choice.reply : undefined,
      nextEvent: typeof choice.nextEvent === 'string' ? choice.nextEvent : undefined,
      effects: Array.isArray(choice.effects) ? choice.effects as StorylineChoiceOption['effects'] : undefined,
    }))
    .filter((choice) => choice.id && choice.label);
}

export function createDefaultStorylineSkillRegistry(): StorylineSkillRegistry {
  const registry = new StorylineSkillRegistry();

  registry
    .registerCondition('condition.game_tick_between', ({ gameTick }, args) => (
      gameTick >= numberArg(args.minTick, 0)
      && gameTick <= numberArg(args.maxTick, Number.POSITIVE_INFINITY)
    ))
    .registerCondition('condition.game_tick_at_least', ({ gameTick }, args) => (
      gameTick >= numberArg(args.tick, 0)
    ))
    .registerCondition('condition.time_of_day_at_or_after', ({ gameTick, services }, args) => (
      services.currentMinute(gameTick) >= numberArg(args.minute, 0)
    ))
    .registerCondition('condition.flag_not_set', ({ services }, args) => (
      services.getFlag(String(args.key ?? '')) !== true
    ))
    .registerCondition('condition.npc_arrival_completed', ({ services }, args) => (
      services.npcArrivalCompleted(String(args.npcId ?? ''))
    ))
    .registerCondition('condition.npc_unlocked', ({ services }, args) => (
      services.npcUnlocked(String(args.npcId ?? ''))
    ))
    .registerCondition('condition.has_house_resident', ({ services }, args) => (
      services.hasHouseResident(String(args.npcId ?? ''))
    ))
    .registerCondition('condition.player_in_world', ({ services }, args) => (
      services.playerInWorld(String(args.worldId ?? 'world:village'))
    ))
    .registerCondition('condition.pet_not_exists', ({ services }, args) => (
      !services.petExists(String(args.petId ?? ''))
    ))
    .registerCondition('condition.quest_state_is', ({ storyline, services }, args) => {
      const questId = String(args.questId ?? storyline.id ?? '');
      const state = String(args.state ?? '');
      if (!questId || !state) return false;
      return String(services.getFlag(`storyline:${questId}:state`) ?? services.getQuestState(storyline)) === state;
    })
    .registerCondition('condition.director_phase_is', ({ storyline, services }, args) => {
      const phase = String(args.phase ?? '');
      if (!phase) return false;
      return services.getDirectorPhase(storyline, String(args.eventId ?? 'event')) === phase;
    });

  registry
    .registerAction('director.begin_event', ({ storyline, gameTick, eventId, services }, args) => {
      services.beginDirectorEvent(storyline, eventId, gameTick, args);
    })
    .registerAction('director.set_phase', ({ storyline, gameTick, eventId, services }, args) => {
      services.setDirectorPhase(storyline, eventId, gameTick, args);
    })
    .registerAction('director.end_event', ({ storyline, gameTick, eventId, services }, args) => {
      services.endDirectorEvent(storyline, eventId, gameTick, args);
    })
    .registerAction('time.set_time_of_day', ({ services }, args) => {
      services.setTimeOfDay(numberArg(args.minute, 0));
    })
    .registerAction('action.run_event', ({ storyline, gameTick, services }, args) => {
      void services.runStorylineEvent(storyline, String(args.eventId ?? ''), gameTick);
    })
    .registerAction('action.set_quest_state', ({ storyline, gameTick, services }, args) => {
      services.setQuestState(
        String(args.questId ?? storyline.id ?? ''),
        String(args.state ?? ''),
        gameTick,
        args,
      );
    })
    .registerAction('action.add_npc_memory', ({ storyline, gameTick, eventId, triggerId, services }, args) => {
      services.addNpcMemory(storyline, args, gameTick, { eventId, triggerId });
    })
    .registerAction('cutscene.lock_player_control', ({ services }) => {
      services.lockPlayer();
    })
    .registerAction('cutscene.unlock_player_control', ({ services }) => {
      services.unlockPlayer();
    })
    .registerAction('camera.pan_to', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      await services.panTo(
        services.resolveCameraTarget(args.target),
        numberArg(args.durationMs, 650),
      );
    })
    .registerAction('camera.follow', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.follow(String(args.target ?? 'player'), String(args.vehicleId ?? 'arrival-bus'));
    })
    .registerAction('vehicle.spawn_bus', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.spawnBus(String(args.vehicleId ?? 'arrival-bus'));
      services.playAudio('vehicle.bus_engine', { tag: `vehicle:${String(args.vehicleId ?? 'arrival-bus')}` });
    })
    .registerAction('vehicle.move_bus_to_station', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      await services.moveBusToStation(
        String(args.vehicleId ?? 'arrival-bus'),
        numberArg(args.durationMs, 2600),
      );
    })
    .registerAction('vehicle.open_bus_door', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.playAudio('vehicle.bus_door');
      await services.playBusDoor(String(args.vehicleId ?? 'arrival-bus'), 'open');
    })
    .registerAction('vehicle.close_bus_door', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.playAudio('vehicle.bus_door', { rate: 0.86 });
      await services.playBusDoor(String(args.vehicleId ?? 'arrival-bus'), 'close');
    })
    .registerAction('vehicle.move_bus_offscreen', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      await services.moveBusOffscreen(
        String(args.vehicleId ?? 'arrival-bus'),
        args.direction === 'right' ? 'right' : 'left',
        numberArg(args.durationMs, 4200),
      );
    })
    .registerAction('vehicle.despawn_bus', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.stopAudioTag(`vehicle:${String(args.vehicleId ?? 'arrival-bus')}`, 400);
      services.despawnBus(String(args.vehicleId ?? 'arrival-bus'));
    })
    .registerAction('audio.play_sfx', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.playAudio(String(args.key ?? ''), args);
    })
    .registerAction('audio.play_music', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.playMusic(String(args.key ?? ''), args);
    })
    .registerAction('audio.stop_tag', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.stopAudioTag(String(args.tag ?? ''), numberArg(args.fadeMs, 0));
    })
    .registerAction('vehicle.drop_off_passengers', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      await services.dropOffPassengers(args);
    })
    .registerAction('vehicle.pick_up_passengers', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      await services.pickUpPassengers(args);
    })
    .registerAction('action.hide_player', ({ services, actionsByNpc }) => {
      services.flushNpcActions(actionsByNpc);
      services.setPlayerVisible(false);
    })
    .registerAction('action.show_player', ({ services, actionsByNpc }) => {
      services.flushNpcActions(actionsByNpc);
      services.setPlayerVisible(true);
    })
    .registerAction('action.hide_npc', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.setNpcVisible(args, false);
    })
    .registerAction('action.show_npc', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.setNpcVisible(args, true);
    })
    .registerAction('action.place_player', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.placePlayer(args);
    })
    .registerAction('action.place_npc', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.placeNpc(args);
    })
    .registerAction('action.approach_player', ({ services, actionsByNpc }, args) => {
      services.queueNpcAction(args, actionsByNpc, {
        type: 'move',
        target: { kind: 'entity', ref: 'player' },
        duration: numberArg(args.timeoutMs, 8000) / 1000,
      });
    })
    .registerAction('action.ensure_npc_in_world', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      await services.ensureNpcInWorld(args);
    })
    .registerAction('dialogue.choice', async (context, args) => {
      const { storyline, gameTick, eventId = '', actionsByNpc, services } = context;
      const prompt = String(args.prompt ?? '');
      const choices = normalizeChoices(args.choices);
      if (!prompt || choices.length === 0) return;

      services.flushNpcActions(actionsByNpc);
      services.setQuestState(storyline.id ?? '', 'offered', gameTick, { eventId });
      services.addNpcMemory(storyline, {
        npcId: args.npcId,
        text: prompt,
        importance: 7,
      }, gameTick, { eventId });

      const selected = await services.requestPlayerChoice(storyline, eventId, args, choices);
      if (!selected) return;

      services.recordChoice(storyline.id ?? '', eventId, selected.id);
      if (selected.reply) {
        services.makeNpcSay(String(args.npcId ?? ''), selected.reply);
        await services.wait(numberArg(args.replyDurationMs, 2200));
      }
      if (selected.effects?.length) {
        await services.executeNestedSteps(context, selected.effects);
      }
      if (selected.nextEvent) {
        await services.runStorylineEvent(storyline, selected.nextEvent, gameTick);
      }
    })
    .registerAction('dialogue.approach_choice', async (context, args) => {
      const { storyline, gameTick, eventId = '', actionsByNpc, services } = context;
      const prompt = String(args.prompt ?? '');
      const choices = normalizeChoices(args.choices);
      if (!prompt || choices.length === 0) return;

      services.flushNpcActions(actionsByNpc);
      await services.approachNpcForDialogue(args);
      services.setQuestState(storyline.id ?? '', 'offered', gameTick, { eventId });
      services.addNpcMemory(storyline, {
        npcId: args.npcId,
        text: prompt,
        importance: 7,
      }, gameTick, { eventId });

      services.makeNpcSay(String(args.npcId ?? ''), prompt);
      await services.wait(numberArg(args.promptDurationMs, 2200));

      const selected = await services.requestPlayerChoice(storyline, eventId, args, choices);
      if (!selected) return;

      services.recordChoice(storyline.id ?? '', eventId, selected.id);
      if (selected.reply) {
        services.makeNpcSay(String(args.npcId ?? ''), selected.reply);
        await services.wait(numberArg(args.replyDurationMs, 2200));
      }
      if (selected.effects?.length) {
        await services.executeNestedSteps(context, selected.effects);
      }
      if (selected.nextEvent) {
        await services.runStorylineEvent(storyline, selected.nextEvent, gameTick);
      }
    })
    .registerAction('action.npc_say', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.makeNpcSay(String(args.npcId ?? args.speaker ?? ''), String(args.text ?? ''));
      await services.wait(numberArg(args.durationMs, 2200));
    })
    .registerAction('action.player_say', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.makePlayerSay(String(args.text ?? ''));
      await services.wait(numberArg(args.durationMs, 2200));
    })
    .registerAction('action.spawn_pet', ({ services, actionsByNpc, gameTick }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.spawnPet(args, gameTick);
    })
    .registerAction('action.set_pet_home', ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.setPetHome(args);
    })
    .registerAction('action.add_pet_memory', ({ services, actionsByNpc, gameTick }, args) => {
      services.flushNpcActions(actionsByNpc);
      services.addPetMemory(args, gameTick);
    })
    .registerAction('sequence.wait_ticks', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      await services.wait(Math.max(0, numberArg(args.ticks, 0)) * 1000);
    })
    .registerAction('sequence.wait_ms', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      await services.wait(Math.max(0, numberArg(args.durationMs, 0)));
    })
    .registerAction('sequence.wait_for_player_world', async ({ services, actionsByNpc }, args) => {
      services.flushNpcActions(actionsByNpc);
      await services.waitForPlayerWorld(
        String(args.worldId ?? 'world:village'),
        Math.max(0, numberArg(args.timeoutMs, 30000)),
        Math.max(50, numberArg(args.pollMs, 250)),
      );
    });

  return registry;
}
