#!/usr/bin/env python3
"""
Joystick to Keyboard Mapper for Wii Rhythm Channel Pro
Converts joystick/gamepad inputs to WASD/Arrow key presses for the rhythm game.
"""

import pygame
import time
import subprocess
import sys

# Initialize Pygame
pygame.init()

# Try to initialize joystick
try:
    pygame.joystick.init()
    joystick_count = pygame.joystick.get_count()
    
    if joystick_count == 0:
        print("No joystick/gamepad detected!")
        sys.exit(1)
    
    # Use the first joystick
    joystick = pygame.joystick.Joystick(0)
    joystick.init()
    
    print(f"Joystick detected: {joystick.get_name()}")
    print(f"Axes: {joystick.get_numaxes()}, Buttons: {joystick.get_numbuttons()}, Hats: {joystick.get_numhats()}")
    print("\nControls:")
    print("D-Pad or Left Stick: Arrow keys (WASD)")
    print("Button 0: W/Up")
    print("Button 1: S/Down")
    print("Button 2: A/Left")
    print("Button 3: D/Right")
    print("Button 4 or 5: Enter (for menu selection)")
    print("Press Ctrl+C to exit\n")
    
except Exception as e:
    print(f"Error initializing joystick: {e}")
    sys.exit(1)

# Key mapping - adjust these based on your joystick
# Using xdotool or pynput for keyboard simulation
try:
    from pynput.keyboard import Key, Controller
    keyboard = Controller()
    USE_PYNPUT = True
    print("Using pynput for keyboard simulation")
except ImportError:
    print("pynput not installed. Install with: pip install pynput")
    USE_PYNPUT = False

# Configuration - adjust based on your joystick
DPAD_MAPPING = {
    'up': 'w',
    'down': 's',
    'left': 'a',
    'right': 'd'
}

BUTTON_MAPPING = {
    0: 'w',  # Button 0 = W/Up
    1: 's',  # Button 1 = S/Down
    2: 'a',  # Button 2 = A/Left
    3: 'd',  # Button 3 = D/Right
    4: 'enter',  # Button 4 = Enter (for menu selection)
    5: 'enter',  # Button 5 = Enter (alternative)
}

# Track pressed keys to avoid repeats
pressed_keys = set()

def press_key(key):
    """Press a keyboard key"""
    if key == 'enter':
        # Enter key doesn't need to track pressed state
        pass
    elif key in pressed_keys:
        return  # Already pressed
    
    if key != 'enter':
        pressed_keys.add(key)
    
    if USE_PYNPUT:
        try:
            if key == 'w':
                keyboard.press(Key.up if Key.up else 'w')
            elif key == 's':
                keyboard.press(Key.down if Key.down else 's')
            elif key == 'a':
                keyboard.press(Key.left if Key.left else 'a')
            elif key == 'd':
                keyboard.press(Key.right if Key.right else 'd')
            elif key == 'enter':
                keyboard.press(Key.enter)
            else:
                keyboard.press(key)
        except Exception as e:
            print(f"Error pressing key {key}: {e}")
    else:
        # Fallback: use xdotool (Linux only)
        subprocess.run(['xdotool', 'keydown', key], capture_output=True)

def release_key(key):
    """Release a keyboard key"""
    if key == 'enter':
        # Enter key release
        if USE_PYNPUT:
            try:
                keyboard.release(Key.enter)
            except Exception as e:
                print(f"Error releasing enter: {e}")
        else:
            subprocess.run(['xdotool', 'keyup', 'Return'], capture_output=True)
        return
    
    if key not in pressed_keys:
        return  # Not pressed
    
    pressed_keys.remove(key)
    
    if USE_PYNPUT:
        try:
            if key == 'w':
                keyboard.release(Key.up if Key.up else 'w')
            elif key == 's':
                keyboard.release(Key.down if Key.down else 's')
            elif key == 'a':
                keyboard.release(Key.left if Key.left else 'a')
            elif key == 'd':
                keyboard.release(Key.right if Key.right else 'd')
            else:
                keyboard.release(key)
        except Exception as e:
            print(f"Error releasing key {key}: {e}")
    else:
        # Fallback: use xdotool
        subprocess.run(['xdotool', 'keyup', key], capture_output=True)

def process_hat(hat_value):
    """Process D-Pad/hat input"""
    x, y = hat_value
    
    # Release all keys first
    for key in ['w', 's', 'a', 'd']:
        release_key(key)
    
    # Press appropriate keys based on hat position
    if y == 1:  # Up
        press_key('w')
    elif y == -1:  # Down
        press_key('s')
    
    if x == -1:  # Left
        press_key('a')
    elif x == 1:  # Right
        press_key('d')

def process_axis(axis, value):
    """Process analog stick input"""
    deadzone = 0.3  # Ignore small movements
    
    if abs(value) < deadzone:
        value = 0
    
    # Axis 1 is typically Y (vertical), Axis 0 is typically X (horizontal)
    if axis == 1:  # Y-axis (vertical)
        if value < -deadzone:
            press_key('w')
            release_key('s')
        elif value > deadzone:
            press_key('s')
            release_key('w')
        else:
            release_key('w')
            release_key('s')
    elif axis == 0:  # X-axis (horizontal)
        if value < -deadzone:
            press_key('a')
            release_key('d')
        elif value > deadzone:
            press_key('d')
            release_key('a')
        else:
            release_key('a')
            release_key('d')

def process_button(button, pressed):
    """Process button input"""
    if button in BUTTON_MAPPING:
        key = BUTTON_MAPPING[button]
        if pressed:
            if key == 'enter':
                # Enter key - press and release immediately
                press_key('enter')
                release_key('enter')
            else:
                press_key(key)
        else:
            if key != 'enter':  # Don't release enter, already released
                release_key(key)

def main():
    """Main loop"""
    clock = pygame.time.Clock()
    running = True
    
    print("Starting joystick listener...")
    print("Move your joystick/use buttons to control the game.")
    print("Press Ctrl+C to stop.\n")
    
    try:
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                
                # Process hat/D-pad
                if event.type == pygame.JOYHATMOTION:
                    process_hat(event.value)
                
                # Process analog sticks
                elif event.type == pygame.JOYAXISMOTION:
                    process_axis(event.axis, event.value)
                
                # Process buttons
                elif event.type == pygame.JOYBUTTONDOWN:
                    process_button(event.button, True)
                elif event.type == pygame.JOYBUTTONUP:
                    process_button(event.button, False)
            
            clock.tick(60)  # 60 FPS polling
            
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        # Release all keys before exiting
        for key in list(pressed_keys):
            release_key(key)
        
        pygame.quit()
        print("Joystick listener stopped.")

if __name__ == "__main__":
    main()

